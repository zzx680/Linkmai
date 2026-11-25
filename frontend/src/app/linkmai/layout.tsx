import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./site-shell";
import styles from "./site.module.css";

export const metadata: Metadata = {
    title: "灵迈 LinkMai｜官网",
    description: "灵迈 LinkMai 官方网站，产品与服务内容即将发布。",
};

export default function LinkMaiSiteLayout({
    children,
}: Readonly<{ children: ReactNode }>) {
    return (
        <div className={styles.site}>
            <SiteHeader />
            <div className={styles.siteContent}>{children}</div>
            <SiteFooter />
        </div>
    );
}
