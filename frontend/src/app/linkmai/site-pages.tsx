"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import styles from "./site.module.css";

const homePanels = [
    { label: "产品介绍", title: "一个项目，装下完整工作", copy: "围绕项目整理材料、对话、审查发现与交付文档，结果能回到原文核对。" },
    { label: "服务方式", title: "云端或自托管，自选模型", copy: "团队可以维护自己的审查标准、模板与流程，并选择适合的部署方式。" },
    { label: "使用指南", title: "从上传到交付，全程可回查", copy: "材料、修改与导出记录留在项目里，重要结论可以回到来源确认。" },
];

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

export function HomePage() {
    const [panel, setPanel] = useState(0);
    return (
        <main>
            <section aria-labelledby="hero-title" className={styles.hero} id="top">
                <div aria-label="莫奈《罂粟花田》（1873）" className={styles.heroArtwork} role="img" />
                <div className={styles.heroContent}>
                    <p className={styles.eyebrow}>灵迈 LinkMai</p>
                    <h1 id="hero-title">让清晰的方向，<br />从这里开始。</h1>
                    <p className={styles.heroNote}>开源法律 AI 工作台，面向中国律师、律所与企业法务</p>
                    <div className={styles.heroActions}>
                        <Link className={styles.primaryButton} href="/login">登录 / 进入工作台</Link>
                        <Link className={styles.textButton} href="#product">了解产品 <span aria-hidden="true">↗</span></Link>
                    </div>
                </div>
                <span aria-hidden="true" className={styles.heroIndex}>LINKMAI&nbsp; / &nbsp;01</span>
            </section>

            <section aria-label="官网栏目" className={styles.ribbon}>
                <span>灵迈 LinkMai</span><i />
                <span>产品介绍</span><i />
                <span>服务与支持</span><i />
                <span>内容动态</span><i />
                <span>开源 · 可自托管 · 可扩展</span>
            </section>

            <section className={styles.intro} id="product">
                <SectionLabel>01 / 灵迈官网</SectionLabel>
                <div className={styles.introGrid}>
                    <h2>为灵迈，<br />留一处清晰的窗口。</h2>
                    <div className={styles.introCopy}>
                        <p className={styles.introLead}>把材料阅读、合同审阅与文书起草，放进同一个项目。</p>
                        <p>围绕项目整理材料，按团队标准审阅和起草文档，核对结论依据，并将修改交付到 Word。支持自托管、自选模型与专业技能扩展。</p>
                        <Link href="/linkmai/about">了解网站栏目 <span aria-hidden="true">↗</span></Link>
                    </div>
                </div>
                <div aria-hidden="true" className={styles.orbitGraphic}>
                    <span className={styles.orbitOuter} /><span className={styles.orbitInner} />
                    <span className={styles.orbitDot} /><span className={styles.orbitCenter}>L</span>
                    <span className={styles.orbitCaption}>灵迈 · 开源法律 AI 工作台</span>
                </div>
            </section>

            <section aria-labelledby="preview-title" className={styles.showcase}>
                <div className={styles.showcaseHeading}>
                    <SectionLabel>02 / 内容预览</SectionLabel>
                    <h2 id="preview-title">从材料到交付，<br />保持一条清晰的线。</h2>
                </div>
                <div className={styles.showcasePanel}>
                    <div className={styles.showcaseTabs} role="tablist" aria-label="内容预览栏目">
                        {homePanels.map((item, index) => (
                            <button
                                aria-selected={panel === index}
                                className={panel === index ? styles.showcaseTabSelected : styles.showcaseTab}
                                id={`home-tab-${index}`}
                                key={item.label}
                                onClick={() => setPanel(index)}
                                role="tab"
                                type="button"
                            >{item.label}</button>
                        ))}
                    </div>
                    <div aria-labelledby={`home-tab-${panel}`} className={styles.showcaseBody} role="tabpanel">
                        <span className={styles.showcaseIndex}>0{panel + 1}</span>
                        <div><p className={styles.showcaseEyebrow}>LINKMAI / {homePanels[panel].label}</p><h3>{homePanels[panel].title}</h3><p>{homePanels[panel].copy}</p></div>
                        <Link href={panel === 0 ? "/linkmai/product" : panel === 1 ? "/linkmai/workflows" : "/linkmai/faq"}>
                            查看栏目 <span aria-hidden="true">↗</span>
                        </Link>
                    </div>
                </div>
            </section>

            <section className={styles.preview}>
                <div className={styles.previewHeading}>
                    <SectionLabel>03 / 网站栏目</SectionLabel>
                    <h2>从这里了解灵迈</h2>
                </div>
                <div className={styles.previewCards}>
                    {[
                        ["01", "产品介绍", "了解灵迈如何组织法律工作。", "/linkmai/product"],
                        ["02", "服务与支持", "部署方式、支持范围与常见问题。", "/linkmai/workflows"],
                        ["03", "内容动态", "产品更新与开源进展。", "/linkmai/blog"],
                    ].map(([number, title, text, href]) => (
                        <Link className={styles.previewCard} href={href} key={number}>
                            <span className={styles.cardNumber}>{number}</span><span className={styles.cardTitle}>{title}</span>
                            <span className={styles.cardDescription}>{text}</span><span aria-hidden="true" className={styles.cardArrow}>↗</span>
                        </Link>
                    ))}
                </div>
            </section>

            <section className={styles.closing}>
                <SectionLabel>04 / 保持联系</SectionLabel>
                <h2>灵迈，<br />稍后见。</h2>
                <p>更多内容正在准备中。</p>
                <Link className={styles.closingLink} href="/linkmai/contact">前往联系页面 <span aria-hidden="true">↗</span></Link>
                <span aria-hidden="true" className={styles.closingStamp}>L<br />灵迈</span>
            </section>
        </main>
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
    const [sent, setSent] = useState(false);
    const [error, setError] = useState(false);
    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        if (!data.get("name") || !data.get("email") || !data.get("message")) {
            setError(true);
            return;
        }
        setError(false);
        setSent(true);
        event.currentTarget.reset();
    }
    return (
        <main className={`${styles.interior} ${styles.contactPage}`}>
            <div className={styles.interiorHeader}><p className={styles.eyebrow}>LINKMAI / 04</p><h1>联系灵迈</h1><p>联系渠道与服务信息待确认后更新。</p></div>
            <form className={styles.contactForm} onSubmit={submit}>
                <label>姓名<input autoComplete="name" name="name" required /></label>
                <label>邮箱<input autoComplete="email" name="email" required type="email" /></label>
                <label className={styles.formWide}>主题<input name="subject" /></label>
                <label className={styles.formWide}>留言<textarea name="message" required rows={6} /></label>
                <div className={styles.formActions}>
                    <p aria-live="polite" className={error ? styles.formError : styles.formStatus}>{error ? "请填写姓名、有效邮箱和留言。" : sent ? "这是本地交互预览，表单尚未连接到消息服务。" : "表单为本地预览，提交不会发送给任何人。"}</p>
                    <button className={styles.primaryButton} type="submit">提交预览 <span aria-hidden="true">↗</span></button>
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
    return <main className={styles.interior}><Placeholder title="没有找到这个页面" text="请从网站栏目继续浏览。" /><div className={styles.interiorCta}><Link className={styles.primaryButton} href="/linkmai">返回首页</Link></div></main>;
}
