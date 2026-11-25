import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it("leaves unknown public destinations unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_LINKMAI_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_LINKMAI_TERMS_URL", "javascript:alert(1)");
    vi.stubEnv("NEXT_PUBLIC_LINKMAI_PRIVACY_URL", "https://user:secret@example.com/privacy");
    vi.stubEnv("NEXT_PUBLIC_LINKMAI_SUPPORT_EMAIL", "");
    const config = await import("./productConfig");
    expect(config.PRODUCT_NAME).toBe("灵迈 LinkMai");
    expect(config.PRODUCT_SITE_URL).toBeNull();
    expect(config.PRODUCT_TERMS_URL).toBeNull();
    expect(config.PRODUCT_PRIVACY_URL).toBeNull();
    expect(config.PRODUCT_SUPPORT_EMAIL).toBe("");
});

it("accepts an explicitly configured HTTPS site and mailbox", async () => {
    vi.stubEnv("NEXT_PUBLIC_LINKMAI_SITE_URL", "https://legal.example.test");
    vi.stubEnv("NEXT_PUBLIC_LINKMAI_TERMS_URL", "https://legal.example.test/terms");
    vi.stubEnv("NEXT_PUBLIC_LINKMAI_PRIVACY_URL", "https://legal.example.test/privacy");
    vi.stubEnv("NEXT_PUBLIC_LINKMAI_SUPPORT_EMAIL", "help@example.test");
    const config = await import("./productConfig");
    expect(config.PRODUCT_SITE_URL).toBe("https://legal.example.test/");
    expect(config.PRODUCT_TERMS_URL).toBe("https://legal.example.test/terms");
    expect(config.PRODUCT_PRIVACY_URL).toBe("https://legal.example.test/privacy");
    expect(config.PRODUCT_SUPPORT_EMAIL).toBe("help@example.test");
});

it("rejects malformed URLs and invalid mailbox syntax", async () => {
    vi.stubEnv("NEXT_PUBLIC_LINKMAI_SITE_URL", "not-a-url");
    vi.stubEnv("NEXT_PUBLIC_LINKMAI_SUPPORT_EMAIL", "not-a-mailbox");
    const config = await import("./productConfig");
    expect(config.PRODUCT_SITE_URL).toBeNull();
    expect(config.PRODUCT_SUPPORT_EMAIL).toBe("");
});
