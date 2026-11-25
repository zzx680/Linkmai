"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import styles from "./site.module.css";

const resources = [
    { label: "产品", href: "/linkmai/product" },
    { label: "工作流", href: "/linkmai/workflows" },
    { label: "部署方式", href: "/linkmai/deploy" },
    { label: "内容动态", href: "/linkmai/blog" },
    { label: "关于灵迈", href: "/linkmai/about" },
];

function BrandMark({ className = "" }: { className?: string }) {
    return (
        <svg
            aria-hidden="true"
            className={`${styles.brandMark} ${className}`}
            fill="none"
            viewBox="0 0 34 34"
        >
            <circle cx="17" cy="17" r="4.2" fill="currentColor" />
            <path
                d="M17 1.8v7.4M17 24.8v7.4M1.8 17h7.4m15.6 0h7.4M6.25 6.25l5.2 5.2m11.1 11.1 5.2 5.2m0-21.5-5.2 5.2m-11.1 11.1-5.2 5.2"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.4"
            />
        </svg>
    );
}

export function SiteHeader() {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();

    return (
        <header className={styles.header}>
            <Link aria-label="灵迈 LinkMai 首页" className={styles.brand} href="/">
                <BrandMark />
                <span>灵迈</span>
                <span className={styles.brandLatin}>LinkMai</span>
            </Link>
            <div className={styles.headerActions}>
                <button
                    aria-controls="linkmai-resources"
                    aria-expanded={open}
                    className={styles.resourcesButton}
                    onClick={() => setOpen((value) => !value)}
                    type="button"
                >
                    栏目 <span aria-hidden="true" className={open ? styles.chevronOpen : styles.chevron}>⌄</span>
                </button>
                <Link className={styles.headerContact} href="/login">登录</Link>
                <Link className={styles.resourcesButton} href="/linkmai/contact">联系我们</Link>
            </div>
            {open && (
                <nav aria-label="网站栏目" className={styles.resourcesMenu} id="linkmai-resources">
                    {resources.map((item) => (
                        <Link
                            aria-current={pathname === item.href ? "page" : undefined}
                            href={item.href}
                            key={item.href}
                            onClick={() => setOpen(false)}
                        >
                            {item.label}<span aria-hidden="true">↗</span>
                        </Link>
                    ))}
                    <Link href="/linkmai/contact" onClick={() => setOpen(false)}>
                        联系我们<span aria-hidden="true">↗</span>
                    </Link>
                </nav>
            )}
        </header>
    );
}

export function SiteFooter() {
    const pathname = usePathname();
    return (
        <footer className={styles.footer}>
            <Link className={styles.footerBrand} href="/">
                <BrandMark /> 灵迈 <span>LinkMai</span>
            </Link>
            <nav aria-label="页脚导航" className={styles.footerLinks}>
                <Link href="/linkmai/product">产品</Link>
                <Link href="/linkmai/workflows">工作流</Link>
                <Link href="/linkmai/blog">内容动态</Link>
                <Link href="/linkmai/contact">联系</Link>
                <Link href="/linkmai/privacy">隐私</Link>
                <Link href="/linkmai/terms">条款</Link>
            </nav>
            <p>© 2026 灵迈 LinkMai</p>
            <Link className={styles.backToTop} href={pathname === "/" ? "#top" : "/#top"}>回到顶部 ↑</Link>
        </footer>
    );
}
