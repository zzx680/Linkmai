
import { uiText } from "@mike/client";
import type { Metadata } from "next";
// Self-hosted Inter and EB Garamond; sets --font-inter and --font-eb-garamond.
import "./fonts/fonts.css";
import "./globals.css";
import { Providers } from "@/app/components/providers";
import { PRODUCT_SITE_URL } from "@/app/lib/productConfig";
import { UI_LOCALE } from "@/app/lib/localization";

export const metadata: Metadata = {
    ...(PRODUCT_SITE_URL ? { metadataBase: new URL(PRODUCT_SITE_URL) } : {}),
    title: "灵迈 LinkMai · 法律 AI 工作台",
    description:
        "面向法律专业人士的 AI 工作台，支持文档分析、合同审阅与法律文书起草。",
    icons: {
        icon: [
            { url: "/icon.svg", type: "image/svg+xml" },
            { url: "/favicon.ico" },
        ],
        apple: "/apple-touch-icon.png",
    },
    openGraph: {
        type: "website",
        locale: "zh_CN",
        ...(PRODUCT_SITE_URL ? { url: PRODUCT_SITE_URL } : {}),
        siteName: "灵迈 LinkMai",
        title: "灵迈 LinkMai · 法律 AI 工作台",
        description:
            "面向法律专业人士的 AI 工作台，支持文档分析、合同审阅与法律文书起草。",
        images: [
            {
                url: "/link-image.jpg",
                width: 1200,
                height: 651,
                alt: uiText("灵迈 LinkMai"),
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "灵迈 LinkMai · 法律 AI 工作台",
        description:
            "面向法律专业人士的 AI 工作台，支持文档分析、合同审阅与法律文书起草。",
        images: ["/link-image.jpg"],
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang={UI_LOCALE}>
            <body
                className="font-sans antialiased"
            >
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
