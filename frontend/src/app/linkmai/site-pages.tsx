"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { submitContactMessage } from "@/app/lib/contactApi";
import styles from "./site.module.css";

const featureGroups = [
    { label: "全部", title: "网站内容", description: "LinkMai 的产品与服务介绍将在此发布。" },
    { label: "产品", title: "产品介绍", description: "产品功能与使用方式待确认后更新。" },
    { label: "服务", title: "服务流程", description: "服务步骤与支持范围待确认后更新。" },
    { label: "指南", title: "使用指南", description: "操作说明与常见问题待整理后更新。" },
];

const workflowItems = [
    { title: "产品信息", type: "产品", description: "内容待发布" },
    { title: "服务流程", type: "服务", description: "内容待发布" },
    { title: "常见问题", type: "指南", description: "内容待发布" },
    { title: "内容更新", type: "动态", description: "内容待发布" },
];

const policyAnchors = ["适用范围", "信息处理", "内容与责任", "联系与更新"];

function SectionLabel({ children, side = "LINKMAI" }: { children: string; side?: string }) {
    return (
        <div className={styles.sectionLabel}>
            <span>{children}</span>
            <span>{side}</span>
        </div>
    );
}

function Placeholder({ title, text }: { title: string; text: string }) {
    return (
        <div className={styles.placeholder}>
            <span aria-hidden="true" className={styles.placeholderMark}>✳</span>
            <p className={styles.placeholderKicker}>内容准备中</p>
            <h2>{title}</h2>
            <p>{text}</p>
        </div>
    );
}

export function InteriorPage({ slug }: { slug: string[] }) {
    const route = slug.join("/");
    if (route === "product") return <ProductPage />;
    if (route === "workflows") return <WorkflowsPage />;
    if (route === "deploy") return <DeployPage />;
    if (route === "contact") return <ContactPage />;
    if (route === "blog") return <BlogPage />;
    if (route === "about") return <AboutPage />;
    if (route === "privacy") return <PolicyPage kind="privacy" />;
    if (route === "terms") return <PolicyPage kind="terms" />;
    if (route === "faq") return <FaqPage />;
    if (route.startsWith("articles/")) return <ArticlePage slug={route.slice("articles/".length)} />;
    return <NotFoundPage />;
}

function ProductPage() {
    const [active, setActive] = useState("全部");
    const visible = active === "全部" ? featureGroups.slice(1) : featureGroups.filter((item) => item.label === active);
    return (
        <main className={styles.interior}>
            <div className={styles.interiorHeader}><p className={styles.eyebrow}>LINKMAI / 01</p><h1>产品</h1><p>LinkMai 产品相关内容将在信息确认后发布。</p></div>
            <div aria-label="产品栏目筛选" className={styles.pills} role="tablist">
                {featureGroups.map((item) => <button aria-selected={active === item.label} className={active === item.label ? styles.pillActive : styles.pill} key={item.label} onClick={() => setActive(item.label)} role="tab" type="button">{item.label}</button>)}
            </div>
            <section aria-label={`${active}栏目内容`} className={styles.featureGrid}>
                {visible.map((item, index) => <article className={styles.featureCard} key={item.label}>
                    <span className={styles.cardNumber}>0{index + 1} / {item.label}</span><h2>{item.title}</h2><p>{item.description}</p>
                    <span aria-hidden="true" className={styles.featureCardMark}>✳</span>
                </article>)}
            </section>
            <div className={styles.interiorCta}><span>栏目内容正在准备中</span><Link className={styles.primaryButton} href="/linkmai/contact">联系我们</Link></div>
        </main>
    );
}

function WorkflowsPage() {
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("全部");
    const items = useMemo(() => workflowItems.filter((item) =>
        (category === "全部" || item.type === category) && `${item.title} ${item.type}`.includes(query.trim()),
    ), [category, query]);
    const categories = ["全部", "产品", "服务", "指南", "动态"];
    return (
        <main className={styles.interior}>
            <div className={styles.interiorHeader}><p className={styles.eyebrow}>LINKMAI / 02</p><h1>工作流与资源</h1><p>相关内容将随 LinkMai 产品信息逐步更新。</p></div>
            <div className={styles.workflowToolbar}>
                <label className={styles.searchField}><span aria-hidden="true">⌕</span><span className={styles.srOnly}>搜索网站栏目</span><input onChange={(event) => setQuery(event.target.value)} placeholder="搜索栏目" value={query} /></label>
                <div aria-label="按类别筛选" className={styles.pills} role="tablist">{categories.map((item) => <button aria-selected={category === item} className={category === item ? styles.pillActive : styles.pill} key={item} onClick={() => setCategory(item)} role="tab" type="button">{item}</button>)}</div>
            </div>
            <div className={styles.workflowTable}>
                <div className={styles.workflowTableHead}><span>栏目名称</span><span>类型</span><span>状态</span></div>
                {items.length ? items.map((item, i) => <button className={styles.workflowRow} key={item.title} onClick={() => setCategory(item.type)} type="button"><span><i className={styles.rowIndex}>0{i + 1}</i>{item.title}</span><span>{item.type}</span><span>{item.description}<b aria-hidden="true">↗</b></span></button>) : <p className={styles.emptyResult}>没有匹配的栏目，请更换关键词或类别。</p>}
            </div>
        </main>
    );
}

function DeployPage() {
    const [open, setOpen] = useState<number | null>(0);
    const items = [
        { title: "产品接入方式", detail: "接入范围和技术方式将在 LinkMai 产品方案确认后发布。" },
        { title: "部署与上线", detail: "部署环境、域名和上线流程将在确认后补充。" },
        { title: "企业与团队服务", detail: "团队支持与服务安排待正式信息发布。" },
    ];
    return (
        <main className={styles.interior}>
            <div className={styles.interiorHeader}><p className={styles.eyebrow}>LINKMAI / 03</p><h1>接入与部署</h1><p>接入、部署和服务说明正在整理中。</p></div>
            <section className={styles.deployIntro}>
                <div className={styles.deployAside}><span>部署信息</span><span>待更新</span></div>
                <div><h2>为正式内容预留的部署说明。</h2><p>具体步骤会根据 LinkMai 的产品形态、托管方式与服务范围补充。</p><Link className={styles.primaryButton} href="/linkmai/contact">咨询与联系</Link></div>
            </section>
            <div aria-label="接入与部署常见栏目" className={styles.accordionList}>
                {items.map((item, i) => <section className={styles.accordionItem} key={item.title}>
                    <button aria-controls={`deploy-panel-${i}`} aria-expanded={open === i} className={styles.accordionTrigger} onClick={() => setOpen(open === i ? null : i)} type="button"><span><i>0{i + 1}</i>{item.title}</span><b aria-hidden="true">{open === i ? "−" : "+"}</b></button>
                    {open === i && <div className={styles.accordionPanel} id={`deploy-panel-${i}`}><p>{item.detail}</p></div>}
                </section>)}
            </div>
        </main>
    );
}

function ContactPage() {
    const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const name = String(data.get("name") ?? "").trim();
        const email = String(data.get("email") ?? "").trim();
        const message = String(data.get("message") ?? "").trim();
        if (!name || !email || !message) {
            setStatus("error");
            return;
        }
        setStatus("sending");
        try {
            await submitContactMessage({
                name,
                email,
                subject: String(data.get("subject") ?? "").trim(),
                message,
            });
            setStatus("sent");
            form.reset();
        } catch {
            setStatus("error");
        }
    }
    return (
        <main className={`${styles.interior} ${styles.contactPage}`}>
            <div className={styles.interiorHeader}><p className={styles.eyebrow}>LINKMAI / 04</p><h1>联系灵迈</h1><p>联系渠道与服务信息待确认后更新。</p></div>
            <form className={styles.contactForm} onSubmit={submit}>
                <input aria-hidden="true" autoComplete="off" className={styles.honeypot} name="website" tabIndex={-1} />
                <label>姓名<input autoComplete="name" name="name" required /></label>
                <label>邮箱<input autoComplete="email" name="email" required type="email" /></label>
                <label className={styles.formWide}>主题<input name="subject" /></label>
                <label className={styles.formWide}>留言<textarea name="message" required rows={6} /></label>
                <div className={styles.formActions}>
                    <p aria-live="polite" className={status === "error" ? styles.formError : styles.formStatus}>
                        {status === "error"
                            ? "提交失败，请检查姓名、邮箱和留言后重试。"
                            : status === "sent"
                              ? "已收到，我们会尽快与你联系。"
                              : status === "sending"
                                ? "正在提交…"
                                : "提交后会直接进入灵迈后台，由工作人员查看。"}
                    </p>
                    <button className={styles.primaryButton} disabled={status === "sending"} type="submit">
                        {status === "sending" ? "提交中…" : "提交"} <span aria-hidden="true">↗</span>
                    </button>
                </div>
            </form>
        </main>
    );
}

function BlogPage() {
    const [category, setCategory] = useState("全部");
    const categories = ["全部", "产品", "指南", "动态"];
    return (
        <main className={styles.interior}>
            <div className={styles.interiorHeader}><p className={styles.eyebrow}>LINKMAI / 05</p><h1>内容动态</h1><p>LinkMai 相关内容将在准备完成后发布。</p></div>
            <div aria-label="动态分类" className={styles.pills} role="tablist">{categories.map((item) => <button aria-selected={category === item} className={category === item ? styles.pillActive : styles.pill} key={item} onClick={() => setCategory(item)} role="tab" type="button">{item}</button>)}</div>
            <section aria-label={`${category}动态`} className={styles.articleGrid}>
                {[
                    ["产品", "产品介绍待发布", "产品相关内容准备中"],
                    ["指南", "使用指南待发布", "使用与帮助内容准备中"],
                    ["动态", "网站动态待发布", "LinkMai 更新内容准备中"],
                ].filter((item) => category === "全部" || item[0] === category).map((item, i) => (
                    <Link className={styles.articleCard} href={`/linkmai/articles/${encodeURIComponent(item[0])}`} key={item[0]}>
                        <span className={styles.cardNumber}>0{i + 1} / {item[0]}</span><h2>{item[1]}</h2><div><span>{item[2]}</span><b aria-hidden="true">↗</b></div>
                    </Link>
                ))}
            </section>
        </main>
    );
}

function AboutPage() {
    return (
        <main className={styles.interior}>
            <div className={styles.interiorHeader}><p className={styles.eyebrow}>LINKMAI / 06</p><h1>关于灵迈</h1><p>品牌与团队信息将在确认后发布。</p></div>
            <section className={styles.aboutFeature}>
                <div aria-hidden="true" className={styles.aboutPainting} />
                <div><span className={styles.cardNumber}>关于我们</span><h2>这里将介绍<br />灵迈 LinkMai。</h2><p>团队背景、品牌故事与联系信息待补充。</p><Link href="/linkmai/contact">联系页面 <span aria-hidden="true">↗</span></Link></div>
            </section>
        </main>
    );
}

function PolicyPage({ kind }: { kind: "privacy" | "terms" }) {
    const title = kind === "privacy" ? "隐私说明" : "服务条款";
    return (
        <main className={`${styles.interior} ${styles.policyPage}`}>
            <div className={styles.interiorHeader}><p className={styles.eyebrow}>LINKMAI / 07</p><h1>{title}</h1><p>正式文件将在服务范围和运营主体确认后发布。</p></div>
            <div className={styles.policyLayout}>
                <nav aria-label={`${title}目录`} className={styles.policyNav}>{policyAnchors.map((item, i) => <a href={`#policy-${i}`} key={item}>0{i + 1}　{item}</a>)}</nav>
                <div className={styles.policyContent}>
                    {policyAnchors.map((item, i) => <section id={`policy-${i}`} key={item}><span>0{i + 1} / {title}</span><h2>{item}</h2><p>本栏目具体内容待 LinkMai 服务信息确认后补充，请以正式发布的文件为准。</p></section>)}
                </div>
            </div>
        </main>
    );
}

function FaqPage() {
    const [open, setOpen] = useState<number | null>(0);
    const items = ["LinkMai 的产品信息何时发布？", "如何联系灵迈？", "在哪里查看网站更新？"];
    return (
        <main className={styles.interior}>
            <div className={styles.interiorHeader}><p className={styles.eyebrow}>LINKMAI / 常见问题</p><h1>常见问题</h1><p>更多帮助信息将随内容准备完成后更新。</p></div>
            <div className={styles.accordionList}>{items.map((item, i) => <section className={styles.accordionItem} key={item}><button aria-controls={`faq-panel-${i}`} aria-expanded={open === i} className={styles.accordionTrigger} onClick={() => setOpen(open === i ? null : i)} type="button"><span><i>0{i + 1}</i>{item}</span><b>{open === i ? "−" : "+"}</b></button>{open === i && <div className={styles.accordionPanel} id={`faq-panel-${i}`}><p>相关信息正在整理中，后续将在 LinkMai 官网公布。</p></div>}</section>)}</div>
        </main>
    );
}

function ArticlePage({ slug }: { slug: string }) {
    const title = decodeURIComponent(slug).replaceAll("-", " ");
    return <main className={styles.interior}><div className={styles.interiorHeader}><p className={styles.eyebrow}>LINKMAI / 内容动态</p><h1>{title || "内容待发布"}</h1><p>文章内容将在准备完成后发布。</p></div><Placeholder title="内容准备中" text="这篇内容尚未发布。你可以先浏览其他网站栏目。" /><div className={styles.interiorCta}><Link className={styles.primaryButton} href="/linkmai/blog">返回内容动态</Link></div></main>;
}

function NotFoundPage() {
    return <main className={styles.interior}><Placeholder title="没有找到这个页面" text="请从网站栏目继续浏览。" /><div className={styles.interiorCta}><Link className={styles.primaryButton} href="/">返回首页</Link></div></main>;
}
