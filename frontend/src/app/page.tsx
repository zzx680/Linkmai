import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "./linkmai/site-shell";
import { HomePage } from "./linkmai/site-pages";
import styles from "./linkmai/site.module.css";

export const metadata: Metadata = {
    title: "灵迈 LinkMai｜官网",
    description:
        "灵迈 LinkMai 官方网站。面向法律专业人士的 AI 工作台，支持文档分析、合同审阅与法律文书起草。",
};

export default function RootPage() {
    return (
        <div className={styles.site}>
            <SiteHeader />
            <div className={styles.siteContent}>
                <HomePage />
            </div>
            <SiteFooter />
        </div>
    );
}
