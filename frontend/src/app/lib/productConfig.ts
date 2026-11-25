/** Public deployment details; leave unknown destinations unconfigured. */
function publicUrl(value: string | undefined): string | null {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password
            ? url.href
            : null;
    } catch {
        return null;
    }
}

export const PRODUCT_NAME = "灵迈 LinkMai";
export const PRODUCT_SITE_URL = publicUrl(process.env.NEXT_PUBLIC_LINKMAI_SITE_URL);
export const PRODUCT_TERMS_URL = publicUrl(process.env.NEXT_PUBLIC_LINKMAI_TERMS_URL);
export const PRODUCT_PRIVACY_URL = publicUrl(process.env.NEXT_PUBLIC_LINKMAI_PRIVACY_URL);
export const PRODUCT_SUPPORT_EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(
    process.env.NEXT_PUBLIC_LINKMAI_SUPPORT_EMAIL ?? "",
) ? process.env.NEXT_PUBLIC_LINKMAI_SUPPORT_EMAIL! : "";
