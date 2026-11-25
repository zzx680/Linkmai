import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOssStorageAdapter, isMissingOssObject } from "./oss";

const OSS_ENV = {
  OSS_BUCKET_NAME: "linkmai-docs",
  OSS_ACCESS_KEY_ID: "test-access-key",
  OSS_ACCESS_KEY_SECRET: "test-secret",
  OSS_REGION: "cn-hangzhou",
  OSS_INTERNAL: "true",
  OSS_ENDPOINT: "https://oss-cn-hangzhou-internal.aliyuncs.com",
  OSS_PUBLIC_ENDPOINT: "https://storage.example.com",
} as const;

describe("createOssStorageAdapter", () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of Object.keys(OSS_ENV)) {
      saved.set(key, process.env[key]);
      process.env[key] = OSS_ENV[key as keyof typeof OSS_ENV];
    }
  });

  afterEach(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    saved.clear();
  });

  it("is enabled only when the bucket, keys, and endpoint are all present", () => {
    expect(createOssStorageAdapter().enabled).toBe(true);

    delete process.env.OSS_ACCESS_KEY_SECRET;
    expect(createOssStorageAdapter().enabled).toBe(false);
  });

  it("signs browser URLs on the public custom domain, never the internal endpoint", async () => {
    const url = await createOssStorageAdapter().getSignedUploadUrl(
      "documents/report.pdf",
      "application/pdf",
      1024,
      900,
    );

    const parsed = new URL(url!);
    expect(parsed.origin).toBe("https://storage.example.com");
    expect(parsed.pathname).toBe("/documents/report.pdf");
    expect(parsed.searchParams.get("OSSAccessKeyId")).toBe("test-access-key");
    expect(parsed.searchParams.get("Expires")).toBeTruthy();
    expect(parsed.searchParams.get("Signature")).toBeTruthy();
    // Content-Type is part of the OSS V1 signature string but not the URL;
    // the upload session returns it as a required request header.
    expect(parsed.searchParams.get("Content-Type")).toBeNull();
  });

  it("caps a signed URL at OSS's 12-hour limit", async () => {
    const url = await createOssStorageAdapter().getSignedUploadUrl(
      "documents/report.pdf",
      "application/pdf",
      1024,
      7 * 24 * 60 * 60,
    );

    const expires = Number(new URL(url!).searchParams.get("Expires"));
    const secondsFromNow = expires - Math.floor(Date.now() / 1000);
    expect(secondsFromNow).toBeGreaterThan(11 * 60 * 60);
    expect(secondsFromNow).toBeLessThanOrEqual(12 * 60 * 60 + 2);
  });
});

describe("isMissingOssObject", () => {
  it("accepts only OSS's explicit NoSuchKey answer", () => {
    expect(isMissingOssObject({ code: "NoSuchKey", status: 404 })).toBe(true);
    expect(isMissingOssObject({ code: "NoSuchBucket", status: 404 })).toBe(
      false,
    );
    // A bare 404 from the wrong endpoint or a proxy must stay a failure.
    expect(isMissingOssObject({ status: 404 })).toBe(false);
    expect(isMissingOssObject(new Error("network"))).toBe(false);
  });
});
