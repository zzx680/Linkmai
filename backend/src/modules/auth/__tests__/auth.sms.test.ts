import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    SmsHookVerificationError,
    verifySendSmsHook,
} from "../auth.sms";
import { phoneSignInEnabled } from "../auth.service";

const secret = `v1,whsec_${Buffer.from("test-webhook-key").toString("base64")}`;
const id = "msg_123";
const timestamp = "1764000000";
const payload = {
    user: { phone: "+8613800138000" },
    sms: { otp: "123456" },
};
const body = Buffer.from(JSON.stringify(payload), "utf8");
const signature = createHmac(
    "sha256",
    Buffer.from("test-webhook-key"),
)
    .update(`${id}.${timestamp}.${body.toString("utf8")}`)
    .digest("base64");

function headers(overrides: Record<string, string> = {}) {
    return {
        "webhook-id": id,
        "webhook-timestamp": timestamp,
        "webhook-signature": `v1,${signature}`,
        ...overrides,
    };
}

describe("verifySendSmsHook", () => {
    it("accepts a correctly signed request and returns the phone and OTP", () => {
        expect(
            verifySendSmsHook(body, headers(), secret, Number(timestamp)),
        ).toEqual(payload);
    });

    it("rejects a changed body", () => {
        const tampered = Buffer.from(
            JSON.stringify({ ...payload, sms: { otp: "000000" } }),
        );
        expect(() =>
            verifySendSmsHook(tampered, headers(), secret, Number(timestamp)),
        ).toThrow(SmsHookVerificationError);
    });

    it("rejects a stale timestamp", () => {
        expect(() =>
            verifySendSmsHook(body, headers(), secret, Number(timestamp) + 301),
        ).toThrow("outside the allowed window");
    });

    it("requires the webhook headers", () => {
        const missing = headers();
        delete (missing as { "webhook-id"?: string })["webhook-id"];
        expect(() =>
            verifySendSmsHook(body, missing, secret, Number(timestamp)),
        ).toThrow("Missing webhook signature headers");
    });

    it("rejects a request without a configured secret", () => {
        expect(() =>
            verifySendSmsHook(body, headers(), "", Number(timestamp)),
        ).toThrow("SEND_SMS_HOOK_SECRET is not configured");
    });
});

describe("phoneSignInEnabled", () => {
  const configured = {
    PHONE_SIGNIN_ENABLED: "true",
    SEND_SMS_HOOK_ENABLED: "true",
    SEND_SMS_HOOK_SECRET: "v1,whsec_dGVzdA==",
    ALIYUN_SMS_ACCESS_KEY_ID: "ak",
    ALIYUN_SMS_ACCESS_KEY_SECRET: "sk",
    ALIYUN_SMS_SIGN_NAME: "LinkMai",
    ALIYUN_SMS_TEMPLATE_CODE: "SMS_1",
  } as NodeJS.ProcessEnv;

  it("enables phone sign-in only when the hook and SMS credentials are complete", () => {
    expect(phoneSignInEnabled(configured)).toBe(true);
    expect(phoneSignInEnabled({ ...configured, ALIYUN_SMS_TEMPLATE_CODE: "" })).toBe(false);
    expect(phoneSignInEnabled({ ...configured, PHONE_SIGNIN_ENABLED: "false" })).toBe(false);
  });
});
