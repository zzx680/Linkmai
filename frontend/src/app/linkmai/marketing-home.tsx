import Image from "next/image";
import Link from "next/link";
import styles from "./marketing.module.css";

const navItems = [
    { label: "产品", href: "/linkmai/product" },
    { label: "工作流", href: "/linkmai/workflows" },
    { label: "部署", href: "/linkmai/deploy" },
    { label: "关于", href: "/linkmai/about" },
];

const ecosystem = ["GitHub", "DeepSeek", "Next.js", "PostgreSQL", "Docker", "阿里云"];

const features = [
    {
        kicker: "01 / ASSISTANT",
        title: "助手",
        body: "读材料、找依据、给引用。把问题问在一份案卷里，而不是散落的聊天记录里。",
        shot: "assistant" as const,
    },
    {
        kicker: "02 / PROJECTS",
        title: "项目",
        body: "每份合同、每个客户、每次审阅都留在同一个项目里；对话、文件和结论不脱节。",
        shot: "projects" as const,
    },
    {
        kicker: "03 / TABULAR REVIEW",
        title: "表格审阅",
        body: "把几十份合同摊成一张表。每个结论都能回到原文的具体页码和句子。",
        shot: "table" as const,
    },
    {
        kicker: "04 / WORKFLOWS",
        title: "工作流",
        body: "把重复的审阅、比对、清单和起草固化成可复用的流程，下一次直接运行。",
        shot: "workflow" as const,
    },
];

const principles = [
    {
        title: "零许可成本",
        body: "没有按席位收费，也没有每年上涨的订阅。模型和 API 成本由你选择、你承担。",
        image: "/mike/paintings/wheatstacks-end-of-summer.webp",
        alt: "莫奈《干草堆》",
    },
    {
        title: "数据留在边界内",
        body: "文件、提示词和审阅记录都在你的存储里。合规、驻留和保密由你控制。",
        image: "/mike/paintings/the-magpie.webp",
        alt: "莫奈《喜鹊》",
    },
    {
        title: "可改，可扩展",
        body: "接入自己的文书库、检索源和引用引擎。代码在你手里，工作流可以按团队长出来。",
        image: "/mike/paintings/sisley-bridge-villeneuve.webp",
        alt: "莫奈《阿让特伊大桥》",
    },
    {
        title: "每一行都可审计",
        body: "提示词怎么拼、文件怎么流、结论从哪里来，都能在代码和记录里查到。",
        image: "/mike/paintings/san-giorgio-maggiore-dusk.webp",
        alt: "莫奈《圣乔治马焦雷的黄昏》",
    },
];

const posts = [
    { title: "把一份合同读成一张风险地图", date: "2026 年 11 月 18 日", kind: "产品" },
    { title: "为什么开源法律 AI 更适合中国律所", date: "2026 年 11 月 12 日", kind: "观点" },
    { title: "LinkMai v0.1：从案卷到交付", date: "2026 年 11 月 6 日", kind: "版本" },
];

function Brand() {
    return (
        <Link className={styles.brand} href="/" aria-label="灵迈 LinkMai 首页">
            <img
                alt=""
                className={styles.brandLockup}
                src="/brand/linkmai-logo.png"
            />
        </Link>
    );
}

function Header() {
    return (
        <header className={styles.nav}>
            <div className={styles.navPill}>
                <Brand />
            </div>
            <div className={`${styles.navPill} ${styles.navRight}`}>
                <nav aria-label="主导航" className={styles.navLinks}>
                    {navItems.map((item) => (
                        <Link href={item.href} key={item.label}>{item.label}</Link>
                    ))}
                </nav>
                <Link className={styles.navLogin} href="/login">登录</Link>
                <Link className={styles.navCta} href="/login">开始使用</Link>
            </div>
            <details className={styles.menu}>
                <summary aria-label="打开导航">
                    <span /><span /><span />
                </summary>
                <div className={styles.menuPanel}>
                    {navItems.map((item) => (
                        <Link href={item.href} key={item.label}>{item.label}</Link>
                    ))}
                    <Link href="/login">登录</Link>
                    <Link className={styles.menuCta} href="/login">开始使用</Link>
                </div>
            </details>
        </header>
    );
}

function FeatureShot({ kind }: { kind: "assistant" | "projects" | "table" | "workflow" }) {
    if (kind === "assistant") {
        return (
            <div className={styles.shot} aria-hidden="true">
                <div className={styles.mockWindow}>
                    <div className={styles.mockBar}><span /><span /><span /></div>
                    <div className={styles.chatMock}>
                        <p className={styles.mockLabel}>MATTER 024 / 股权回购</p>
                        <div className={styles.chatBubble}>请对照第 3.2 条，找出回购触发条件里缺少的前置程序。</div>
                        <div className={styles.chatAnswer}>
                            <span className={styles.chatChip}>已读 4 份材料</span>
                            <p>缺少“经董事会决议”，且未约定回购上限。建议补充，避免触发条件被单方解释。</p>
                            <span className={styles.cite}>《公司法》第 74 条 ↗</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    if (kind === "projects") {
        return (
            <div className={styles.shot} aria-hidden="true">
                <div className={styles.mockWindow}>
                    <div className={styles.mockBar}><span /><span /><span /></div>
                    <p className={styles.mockLabel}>PROJECTS / 股权回购</p>
                    <div className={styles.fileRows}>
                        {[
                            ["股权回购协议.docx", "合同", "128 KB"],
                            ["董事会决议.pdf", "决议", "1.2 MB"],
                            ["投资人清单.xlsx", "清单", "86 KB"],
                            ["尽调备忘录.md", "备忘", "42 KB"],
                        ].map(([name, type, size]) => (
                            <div className={styles.fileRow} key={name}>
                                <span className={styles.fileDot} />
                                <span>{name}</span>
                                <span>{type}</span>
                                <span>{size}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }
    if (kind === "table") {
        return (
            <div className={styles.shot} aria-hidden="true">
                <div className={styles.mockWindow}>
                    <div className={styles.mockBar}><span /><span /><span /></div>
                    <p className={styles.mockLabel}>TABULAR REVIEW / 12 份合同</p>
                    <div className={styles.tableMock}>
                        <div className={styles.tableHead}><span>条款</span><span>风险</span><span>依据</span></div>
                        {[
                            ["回购触发", "高", "3.2"],
                            ["优先清算", "中", "5.4"],
                            ["竞业限制", "低", "8.1"],
                        ].map(([a, b, c]) => (
                            <div className={styles.tableRow} key={a}><span>{a}</span><span>{b}</span><span>p.{c}</span></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className={styles.shot} aria-hidden="true">
            <div className={styles.mockWindow}>
                <div className={styles.mockBar}><span /><span /><span /></div>
                <p className={styles.mockLabel}>WORKFLOWS / 常用流程</p>
                <div className={styles.flowRows}>
                    {["合同审阅 · 回购条款", "尽调清单 · 交割条件", "条款比对 · 投资协议", "文书起草 · 董事会决议"].map((item, i) => (
                        <div className={styles.flowRow} key={item}>
                            <span>{String(i + 1).padStart(2, "0")}</span>
                            <span>{item}</span>
                            <span>运行 ↗</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function MarketingHome() {
    return (
        <div className={styles.page}>
            <Header />
            <main>
                <section className={styles.hero} id="top">
                    <div className={styles.heroMedia}>
                        <Image src="/mike/hero-waterloo.webp" alt="莫奈《滑铁卢桥，灰调天气》" fill priority sizes="100vw" />
                    </div>
                    <div className={styles.heroVeil} aria-hidden="true" />
                    <div className={styles.heroInner}>
                        <p className={styles.eyebrow}>LINKMAI / OPEN-SOURCE LEGAL AI</p>
                        <h1>法律 AI，<br />真正属于你。</h1>
                        <p className={styles.heroLead}>审阅、检索、起草、交付，在同一份案卷里完成。代码开源，文件留在你的存储，模型由你决定。</p>
                        <div className={styles.heroActions}>
                            <Link className={styles.primary} href="/login">开始使用</Link>
                            <Link className={styles.secondary} href="/linkmai/deploy">部署自己的</Link>
                        </div>
                    </div>
                    <a className={styles.scrollHint} href="#demo" aria-label="向下滚动">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                    </a>
                </section>

                <section className={styles.press} aria-label="开源技术生态">
                    <div className={styles.pressTrack}>
                        {ecosystem.map((name) => (
                            <span key={name}>{name}</span>
                        ))}
                    </div>
                </section>

                <section className={styles.section} id="demo">
                    <div className={styles.sectionHead}>
                        <h2>产品演示</h2>
                        <span className={styles.version}>v0.1</span>
                    </div>
                    <Link className={styles.demoFrame} href="/linkmai/product" aria-label="查看产品演示">
                        <Image src="/mike/van-der-neer-moonlit-landscape.webp" alt="夜色中的河岸，产品演示封面" fill sizes="(max-width: 768px) 100vw, 1100px" />
                        <span className={styles.demoShade} />
                        <span className={styles.playButton} aria-hidden="true">▶</span>
                        <span className={styles.demoCaption}>从一份合同开始 · 2:43</span>
                    </Link>
                </section>

                <section className={styles.section} id="community">
                    <h2 className={styles.displayTitle}>开源，写在每一行。</h2>
                    <dl className={styles.metrics}>
                        <div><dt>开源许可证</dt><dd>AGPL-3.0</dd></div>
                        <div><dt>可自托管</dt><dd>100%</dd></div>
                        <div><dt>核心工作流</dt><dd>04</dd></div>
                        <div><dt>交付格式</dt><dd>Word / WPS</dd></div>
                    </dl>
                </section>

                <section className={styles.section} id="features">
                    <div className={styles.sectionHead}>
                        <h2>能力</h2>
                        <Link className={styles.allLink} href="/linkmai/product">查看全部 ↗</Link>
                    </div>
                    <div className={styles.featureGrid}>
                        {features.map((feature) => (
                            <article className={styles.featureCard} key={feature.title}>
                                <FeatureShot kind={feature.shot} />
                                <div className={styles.featureCopy}>
                                    <p className={styles.kicker}>{feature.kicker}</p>
                                    <h3>{feature.title}</h3>
                                    <p>{feature.body}</p>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                <section className={styles.section} id="open-source">
                    <h2 className={styles.centerTitle}>为什么开源？</h2>
                    <div className={styles.principleGrid}>
                        {principles.map((item) => (
                            <article className={styles.principleCard} key={item.title}>
                                <div className={styles.principleMedia}>
                                    <Image src={item.image} alt={item.alt} fill sizes="(max-width: 768px) 100vw, 50vw" />
                                </div>
                                <div className={styles.principleCopy}>
                                    <h3>{item.title}</h3>
                                    <p>{item.body}</p>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                <section className={styles.section} id="blog">
                    <div className={styles.sectionHead}>
                        <h2>文章</h2>
                        <Link className={styles.allLink} href="/linkmai/about">全部文章 ↗</Link>
                    </div>
                    <div className={styles.blogRail}>
                        {posts.map((post) => (
                            <Link className={styles.blogCard} href="/linkmai/about" key={post.title}>
                                <h3>{post.title}</h3>
                                <div><span>{post.date}</span><span>{post.kind}</span></div>
                            </Link>
                        ))}
                    </div>
                </section>

                <section className={styles.cta} id="get-started">
                    <h2>从云端开始。<br />或部署属于你的版本。</h2>
                    <div className={styles.ctaActions}>
                        <Link className={styles.primary} href="/login">开始使用</Link>
                        <Link className={styles.secondary} href="/linkmai/deploy">部署文档</Link>
                    </div>
                </section>
            </main>

            <footer className={styles.footer}>
                <div className={styles.footerMedia}>
                    <Image src="/mike/monet-houses-of-parliament-fog.jpg" alt="莫奈《雾中的国会大厦》" fill sizes="100vw" />
                    <span className={styles.footerShade} />
                </div>
                <div className={styles.footerInner}>
                    <div className={styles.footerBrand}>
                        <Brand />
                        <p>开源法律 AI 工作台。<br />为把判断留在自己手里的团队。</p>
                        <p className={styles.copyright}>© 2026 灵迈 LinkMai<br />AGPL-3.0</p>
                    </div>
                    <div className={styles.footerLinks}>
                        <div><h3>产品</h3><Link href="/linkmai/product">能力</Link><Link href="/linkmai/workflows">工作流</Link><Link href="/linkmai/deploy">部署</Link></div>
                        <div><h3>资源</h3><Link href="/linkmai/about">关于</Link><Link href="https://github.com/zzx680/Linkmai">GitHub</Link><a href="mailto:support@linkmai.com">support@linkmai.com</a></div>
                        <div><h3>法务</h3><Link href="/linkmai/privacy">隐私</Link><Link href="/linkmai/terms">条款</Link></div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
