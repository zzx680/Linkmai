// GoTrue's Send SMS hook. GoTrue creates and checks the OTP; this process only
// verifies the signed request and hands the message to Aliyun. That keeps the
// code lifetime and rate limits in one place while letting the deployment use
// a mainland SMS provider instead of Twilio.

import { createHmac, timingSafeEqual } from "node:crypto";
import { aliyunSmsConfig, sendAliyunSms } from "../../lib/sms/aliyun";

export interface SendSmsHookPayload {
    user: { phone?: string };
    sms: { otp?: string };
}

export class SmsHookVerificationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SmsHookVerificationError";
    }
}

const MAX_SKEW_SECONDS = 5 * 60;

function headerValue(
    headers: Record<string, string | string[] | undefined>,
    name: string,
): string {
    const value = headers[name];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

/**
 * Verify a Standard Webhooks request (Supabase Auth sends webhook-id,
 * webhook-timestamp and webhook-signature). The secret is the value shown by
 * GoTrue as `v1,whsec_<base64>`; the body must be the exact bytes sent.
 */
export function verifySendSmsHook(
    body: Buffer,
    headers: Record<string, string | string[] | undefined>,
    secret: string,
    now: number = Math.floor(Date.now() / 1000),
): SendSmsHookPayload {
    if (!secret.trim()) throw new SmsHookVerificationError("SEND_SMS_HOOK_SECRET is not configured");
    const id = headerValue(headers, "webhook-id");
    const timestamp = headerValue(headers, "webhook-timestamp");
    const signature = headerValue(headers, "webhook-signature");
    if (!id || !timestamp || !signature) {
        throw new SmsHookVerificationError("Missing webhook signature headers");
    }
    const sentAt = Number(timestamp);
    if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > MAX_SKEW_SECONDS) {
        throw new SmsHookVerificationError("Webhook timestamp is outside the allowed window");
    }
    const rawSecret = secret.trim().startsWith("v1,whsec_")
        ? secret.trim().slice("v1,whsec_".length)
        : secret.trim();
    const key = Buffer.from(rawSecret, "base64");
    const expected = createHmac("sha256", key)
        .update(`${id}.${timestamp}.${body.toString("utf8")}`)
        .digest();
    const signatures = signature.split(/\s+/).filter(Boolean);
    const valid = signatures.some((entry) => {
        const [version, value] = entry.split(",", 2);
        if (version !== "v1" || !value) return false;
        const actual = Buffer.from(value, "base64");
        return actual.length === expected.length && timingSafeEqual(actual, expected);
    });
    if (!valid) throw new SmsHookVerificationError("Webhook signature did not match");

    let payload: SendSmsHookPayload;
    try {
        payload = JSON.parse(body.toString("utf8")) as SendSmsHookPayload;
    } catch {
        throw new SmsHookVerificationError("Webhook body is not JSON");
    }
    if (!payload?.user?.phone || !payload?.sms?.otp) {
        throw new SmsHookVerificationError("Webhook payload is missing phone or OTP");
    }
    return payload;
}

export async function sendOtpSms(phone: string, code: string): Promise<void> {
    const config = aliyunSmsConfig();
    if (!config) throw new Error("Aliyun SMS is not configured");
    await sendAliyunSms(config, { phone, code });
}
