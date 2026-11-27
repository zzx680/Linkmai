// Aliyun Dysmsapi (SMS) over its signed RPC endpoint. Keeping this to the
// single SendSms call avoids pulling the whole Alibaba SDK, and the OTP never
// leaves the process except in the request to Aliyun.
//
// Reference: https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25-sendsms

import { createHmac, randomUUID } from "node:crypto";

export interface AliyunSmsConfig {
    accessKeyId: string;
    accessKeySecret: string;
    signName: string;
    templateCode: string;
    regionId: string;
}

export function aliyunSmsConfig(env: NodeJS.ProcessEnv = process.env): AliyunSmsConfig | null {
    const accessKeyId = env.ALIYUN_SMS_ACCESS_KEY_ID?.trim();
    const accessKeySecret = env.ALIYUN_SMS_ACCESS_KEY_SECRET?.trim();
    const signName = env.ALIYUN_SMS_SIGN_NAME?.trim();
    const templateCode = env.ALIYUN_SMS_TEMPLATE_CODE?.trim();
    if (!accessKeyId || !accessKeySecret || !signName || !templateCode) return null;
    return {
        accessKeyId,
        accessKeySecret,
        signName,
        templateCode,
        regionId: env.ALIYUN_SMS_REGION_ID?.trim() || "cn-hangzhou",
    };
}

/** RFC 3986 encoding, as required by the Dysmsapi signature. */
function percentEncode(value: string): string {
    return encodeURIComponent(value)
        .replace(/[!'()*]/g, (char) =>
            `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
        )
        .replace(/%7E/g, "~");
}

/**
 * Aliyun's RPC signature: HMAC-SHA1 over the sorted, encoded query, keyed by
 * the access-key secret plus an ampersand.
 */
export function aliyunSmsSignature(
    params: Record<string, string>,
    accessKeySecret: string,
    method = "GET",
): string {
    const canonical = Object.keys(params)
        .sort()
        .map((key) => `${percentEncode(key)}=${percentEncode(params[key] ?? "")}`)
        .join("&");
    const stringToSign = `${method}&${percentEncode("/")}&${percentEncode(canonical)}`;
    return createHmac("sha1", `${accessKeySecret}&`)
        .update(stringToSign)
        .digest("base64");
}

export class AliyunSmsError extends Error {
    constructor(
        message: string,
        readonly code?: string,
    ) {
        super(message);
        this.name = "AliyunSmsError";
    }
}

export async function sendAliyunSms(
    config: AliyunSmsConfig,
    input: { phone: string; code: string },
    fetchImpl: typeof fetch = fetch,
): Promise<void> {
    const params: Record<string, string> = {
        AccessKeyId: config.accessKeyId,
        Action: "SendSms",
        Format: "JSON",
        PhoneNumbers: input.phone.replace(/^\+/, ""),
        RegionId: config.regionId,
        SignName: config.signName,
        SignatureMethod: "HMAC-SHA1",
        SignatureNonce: randomUUID(),
        SignatureVersion: "1.0",
        TemplateCode: config.templateCode,
        TemplateParam: JSON.stringify({ code: input.code }),
        Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        Version: "2017-05-25",
    };
    params.Signature = aliyunSmsSignature(params, config.accessKeySecret);

    const query = Object.keys(params)
        .sort()
        .map((key) => `${percentEncode(key)}=${percentEncode(params[key] ?? "")}`)
        .join("&");
    const response = await fetchImpl(
        `https://dysmsapi.aliyuncs.com/?${query}`,
        { signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) {
        throw new AliyunSmsError(`Aliyun SMS returned HTTP ${response.status}`);
    }
    const body = (await response.json()) as {
        Code?: string;
        Message?: string;
        RequestId?: string;
    };
    if (body.Code !== "OK") {
        throw new AliyunSmsError(
            body.Message || `Aliyun SMS rejected the request (${body.Code ?? "unknown"})`,
            body.Code,
        );
    }
}
