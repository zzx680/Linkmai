/**
 * Alibaba Cloud OSS adapter (`STORAGE_DRIVER=oss`).
 *
 * The deployment guide targets ECS + RDS PostgreSQL + OSS. OSS exposes an
 * S3-compatible API, but new mainland-China buckets may not reach it through
 * the default public endpoint, and the S3 adapter signs path-style URLs. This
 * adapter uses Alibaba's native SDK instead, so the browser gets a URL on the
 * bucket's custom domain (`https://storage.example.com/<key>`) and the
 * server talks to the same-region internal endpoint.
 *
 * Required env vars:
 *   OSS_BUCKET_NAME        — bucket name
 *   OSS_ACCESS_KEY_ID      — RAM user AccessKey ID (server-side only)
 *   OSS_ACCESS_KEY_SECRET  — RAM user AccessKey secret
 *   OSS_ENDPOINT           — server endpoint, e.g.
 *                            https://oss-cn-hangzhou-internal.aliyuncs.com
 *                            (or set OSS_REGION and OSS_INTERNAL=true)
 *   OSS_PUBLIC_ENDPOINT    — browser-facing custom domain mapped to the
 *                            bucket, e.g. https://storage.example.com
 *
 * `OSS_PUBLIC_ENDPOINT` must be an origin only (no path). OSS requires the
 * domain to be ICP-filed and mapped to the bucket before its CNAME is added;
 * the bucket itself stays private. When it is omitted, the adapter signs
 * against `OSS_ENDPOINT` in virtual-hosted style, which only works where the
 * default endpoint is still allowed.
 *
 * Signed PUTs use OSS's URL signature (V1). Unlike an S3 presign, that
 * signature binds Content-Type but not Content-Length: OSS has no place for
 * a body length in the canonical string. The upload-session seal step
 * (modules/uploads) compares the staged object's size with the declared size
 * and deletes a mismatch, which is the enforcement point for this driver too.
 */

import OSS from "ali-oss";
import type { Readable } from "node:stream";
import type { StorageAdapter, StoredObjectMetadata } from "./adapter";

/** OSS rejects a signed URL whose expiry is more than 12 hours away. */
const MAX_SIGNED_URL_SECONDS = 12 * 60 * 60;

type OssErrorShape = {
  status?: unknown;
  code?: unknown;
  name?: unknown;
};

/**
 * A missing object is an expected answer for reads and a successful outcome
 * for deletes. A missing bucket, an auth failure and a 404 from a proxy must
 * stay failures: the durable cleanup jobs treat a resolved delete as final,
 * and the object may still exist behind a wrong endpoint.
 */
export function isMissingOssObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code } = error as OssErrorShape;
  return code === "NoSuchKey";
}

function isCustomDomain(endpoint: string): boolean {
  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    return !/(^|\.)aliyuncs\.com$/.test(host) && !/(^|\.)aliyuncs\.com\./.test(host);
  } catch {
    return false;
  }
}

function seconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return MAX_SIGNED_URL_SECONDS;
  return Math.min(Math.floor(value), MAX_SIGNED_URL_SECONDS);
}

export function createOssStorageAdapter(): StorageAdapter {
  const bucket = process.env.OSS_BUCKET_NAME?.trim() ?? "";
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID?.trim() ?? "";
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET?.trim() ?? "";
  const region = process.env.OSS_REGION?.trim() ?? "";
  const configuredEndpoint = process.env.OSS_ENDPOINT?.trim() ?? "";
  const internal = process.env.OSS_INTERNAL === "true";
  const endpoint =
    configuredEndpoint ||
    (region
      ? `https://oss-${region}${internal ? "-internal" : ""}.aliyuncs.com`
      : "");
  const publicEndpoint =
    process.env.OSS_PUBLIC_ENDPOINT?.trim() || endpoint;
  const enabled = Boolean(
    bucket && accessKeyId && accessKeySecret && endpoint,
  );

  let cachedClient: OSS | undefined;
  function client(): OSS {
    if (!cachedClient) {
      cachedClient = new OSS({
        region: region || undefined,
        endpoint,
        bucket,
        accessKeyId,
        accessKeySecret,
        secure: endpoint.startsWith("https://"),
        cname: isCustomDomain(endpoint),
        timeout: 60_000,
      });
    }
    return cachedClient;
  }

  // Browser URLs must be signed for the host the browser reaches. The
  // custom domain maps to the same bucket, so the canonical resource stays
  // `/<bucket>/<key>` while the request path is just `/<key>`.
  let cachedBrowserClient:
    | { endpoint: string; client: OSS }
    | undefined;
  function browserClient(): OSS {
    if (publicEndpoint === endpoint) return client();
    if (cachedBrowserClient?.endpoint === publicEndpoint) {
      return cachedBrowserClient.client;
    }
    const signingClient = new OSS({
      region: region || undefined,
      endpoint: publicEndpoint,
      bucket,
      accessKeyId,
      accessKeySecret,
      secure: publicEndpoint.startsWith("https://"),
      cname: true,
      timeout: 60_000,
    });
    cachedBrowserClient = { endpoint: publicEndpoint, client: signingClient };
    return signingClient;
  }

  return {
    enabled,
    configurationHint:
      "OSS_BUCKET_NAME, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, and OSS_ENDPOINT (or OSS_REGION) must be set for STORAGE_DRIVER=oss",

    async uploadFile(key, content, contentType) {
      await client().put(key, Buffer.from(content), { mime: contentType });
    },

    async uploadFileFromPath(key, filePath, contentType) {
      // The SDK stats the path, streams the file and sets Content-Length.
      await client().put(key, filePath, { mime: contentType });
    },

    async getSignedUploadUrl(key, contentType, _expectedSizeBytes, expiresIn) {
      return browserClient().signatureUrl(key, {
        method: "PUT",
        expires: seconds(expiresIn),
        "Content-Type": contentType,
      });
    },

    async downloadFile(key) {
      let content: Buffer;
      try {
        const result = await client().get(key);
        if (!result.content) return null;
        content = Buffer.isBuffer(result.content)
          ? result.content
          : Buffer.from(result.content);
      } catch (error) {
        if (isMissingOssObject(error)) return null;
        throw error;
      }
      return content.buffer.slice(
        content.byteOffset,
        content.byteOffset + content.byteLength,
      ) as ArrayBuffer;
    },

    async openReadStream(key, options) {
      let stream: Readable;
      try {
        const result = await client().getStream(key);
        if (!result.stream) return null;
        stream = result.stream as Readable;
      } catch (error) {
        if (isMissingOssObject(error)) return null;
        throw error;
      }
      const signal = options?.signal;
      if (signal) {
        const stop = () => stream.destroy(signal.reason);
        if (signal.aborted) stop();
        else signal.addEventListener("abort", stop, { once: true });
      }
      return stream as AsyncIterable<Uint8Array>;
    },

    async headFile(key): Promise<StoredObjectMetadata | null> {
      try {
        const result = await client().head(key);
        const headers = result.res.headers as Record<string, string>;
        return {
          size: Number(headers["content-length"] ?? 0),
          etag: headers.etag ?? null,
          contentType: headers["content-type"] ?? null,
        };
      } catch (error) {
        // A missing object is a 404 with NoSuchKey; a bare 404 from a wrong
        // endpoint or proxy must surface as a failure, or cleanup would
        // record never-deleted bytes as gone.
        if (isMissingOssObject(error)) return null;
        throw error;
      }
    },

    async listFiles(prefix) {
      const keys: string[] = [];
      let marker: string | undefined;
      do {
        const result = await client().list(
          {
            prefix,
            "max-keys": 1000,
            ...(marker ? { marker } : {}),
          },
          {},
        );
        for (const object of result.objects ?? []) {
          if (object.name) keys.push(object.name);
        }
        marker = result.isTruncated ? result.nextMarker || undefined : undefined;
      } while (marker);
      return keys;
    },

    async copyFile(sourceKey, targetKey) {
      if (sourceKey === targetKey) return;
      await client().copy(targetKey, sourceKey);
    },

    async deleteFile(key) {
      try {
        await client().delete(key);
      } catch (error) {
        // OSS answers a delete on a missing key with 204. A 404 carrying
        // NoSuchKey is the same outcome; anything else is a failure.
        if (isMissingOssObject(error)) return;
        throw error;
      }
    },

    async getSignedUrl(key, expiresIn, responseContentDisposition) {
      return browserClient().signatureUrl(key, {
        expires: seconds(expiresIn),
        ...(responseContentDisposition
          ? { response: { "content-disposition": responseContentDisposition } }
          : {}),
      });
    },
  };
}
