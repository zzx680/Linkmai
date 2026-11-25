import Link from "next/link";
import styles from "./marketing.module.css";

const navItems = [
    { label: "产品", href: "/linkmai/product" },
    { label: "工作流", href: "/linkmai/workflows" },
    { label: "开源", href: "https://github.com/zzx680/Linkmai" },
    { label: "部署", href: "/linkmai/deploy" },
    { label: "关于", href: "/linkmai/about" },
];

function Brand() {
    return (
        <Link className={styles.brand} href="/" aria-label="灵迈 LinkMai 首页">
            <span className={styles.brandGlyph} aria-hidden="true">L</span>
            <span className={styles.brandName}>灵迈</span>
            <span className={styles.brandLatin}>LINKMAI</span>
        </Link>
    );
}

function SectionTag({ index, children }: { index: string; children: string }) {
    return (
        <p className={styles.sectionTag}>
            <span>{index}</span>
            <span>{children}</span>
        </p>
    );
}

export function MarketingHome() {
    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <Brand />
                <nav aria-label="主导航" className={styles.nav}>
                    {navItems.map((item) => (
                        <Link href={item.href} key={item.label}>{item.label}</Link>
                    ))}
                </nav>
                <div className={styles.headerActions}>
                    <Link className={styles.login} href="/login">登录</Link>
                    <Link className={styles.headerCta} href="/signup">开始使用 <span aria-hidden="true">↗</span></Link>
                </div>
                <details className={styles.mobileMenu}>
                    <summary aria-label="打开导航">菜单</summary>
                    <div>
                        {navItems.map((item) => (
                            <Link href={item.href} key={item.label}>{item.label}</Link>
                        ))}
                        <Link href="/login">登录</Link>
                        <Link href="/signup">开始使用</Link>
                    </div>
                </details>
            </header>

            <main>
                <section className={styles.hero} id="top">
                    <div className={styles.heroCopy}>
                        <p className={styles.kicker}>LINKMAI / OPEN-SOURCE LEGAL AI</p>
                        <h1>法律 AI，<br /><em>真正属于你。</em></h1>
                        <p className={styles.lead}>审阅、检索、起草、交付，在同一份案卷里完成。代码开源，文件留在你的存储，模型由你决定。</p>
                        <div className={styles.heroActions}>
                            <Link className={styles.primary} href="/signup">进入工作台 <span aria-hidden="true">↗</span></Link>
                            <Link className={styles.secondary} href="/linkmai/product">看看它怎么工作</Link>
                        </div>
                        <div className={styles.heroMeta}>
                            <span>AGPL-3.0</span>
                            <span>可自托管</span>
                            <span>Word / WPS</span>
                            <span>DeepSeek</span>
                        </div>
                    </div>

                    <div className={styles.workspace} aria-label="灵迈工作台示意">
                        <div className={styles.workspaceTop}>
                            <span>MATTER 024 / 股权回购</span>
                            <span className={styles.saved}>已保存 09:41</span>
                        </div>
                        <div className={styles.workspaceGrid}>
                            <aside className={styles.fileTree} aria-hidden="true">
                                <p>案卷</p>
                                <span className={styles.fileActive}>股权回购协议.docx</span>
                                <span>董事会决议.pdf</span>
                                <span>投资人清单.xlsx</span>
                                <span>尽调备忘录.md</span>
                                <p className={styles.treeLabel}>审查</p>
                                <span>条款比对</span>
                                <span>风险清单</span>
                            </aside>
                            <article className={styles.document} aria-hidden="true">
                                <p className={styles.docKicker}>第 3 条 / 回购安排</p>
                                <h2>股权回购协议</h2>
                                <p>3.1 投资方持有公司 12.5% 的股权，对应注册资本人民币 125 万元。</p>
                                <p className={styles.highlight}>3.2 若公司未能在 2027 年 6 月 30 日前完成合格上市，投资方有权要求创始股东按年化 8% 的收益率回购其持有的全部股权。</p>
                                <p>3.3 回购价款应在投资方发出书面通知后三十日内支付完毕。</p>
                                <span className={styles.marginNote}>关联条款 · 第 8.4 条</span>
                            </article>
                            <aside className={styles.assistantPanel} aria-hidden="true">
                                <p className={styles.panelLabel}>灵迈 / 审阅</p>
                                <p>第 3.2 条缺少“经董事会决议”的前置程序，且未约定回购上限。建议补充，避免触发条件被单方解释。</p>
                                <div className={styles.citation}>《公司法》第 74 条 <span>↗</span></div>
                                <div className={styles.panelMeta}><span>高优先级</span><span>12 处建议</span></div>
                            </aside>
                        </div>
                        <div className={styles.workspaceFoot}>
                            <span>材料 4</span><span>审查 12</span><span>引用 7</span><span className={styles.footRight}>灵迈 · 本地部署</span>
                        </div>
                    </div>
                </section>

                <div className={styles.ticker} aria-label="产品特性">
                    <span>开源可审计</span><span>文件自持</span><span>模型自选</span><span>逐条引用</span><span>Word / WPS</span><span>阿里云 / 自托管</span>
                </div>

                <section className={styles.manifesto} id="why">
                    <SectionTag index="01">WHY LINKMAI</SectionTag>
                    <div className={styles.manifestoGrid}>
                        <h2>不是另一个<br /><em>更聪明的聊天框。</em></h2>
                        <div className={styles.manifestoBody}>
                            <p className={styles.manifestoLead}>法律工作需要的是可检查的过程：读了哪些材料、依据哪一条、改了哪一句。</p>
                            <div className={styles.principles}>
                                <article>
                                    <span>01</span>
                                    <div><h3>代码与提示词公开</h3><p>每一行代码、每一条审查指令都在仓库里。团队可以审计、修改、再分发，而不是等待供应商更新。</p></div>
                                </article>
                                <article>
                                    <span>02</span>
                                    <div><h3>文件与模型留在自己手里</h3><p>文档进入自己的对象存储，推理走自己选择的模型。敏感案卷不必经过第三方的黑箱。</p></div>
                                </article>
                                <article>
                                    <span>03</span>
                                    <div><h3>从审阅到交付，不换工具</h3><p>材料、对话、修改和导出都在同一个项目里。结论能回到原文，修订能回到 Word 与 WPS。</p></div>
                                </article>
                            </div>
                        </div>
                    </div>
                </section>

                <section className={styles.ideSection} id="product">
                    <div className={styles.ideHeading}>
                        <SectionTag index="02">THE WORKSPACE</SectionTag>
                        <h2>一份案卷，<br /><em>三种视角。</em></h2>
                        <p>左边是文件，中间是原文，右边是助手。不是把文档拖进聊天框，而是让对话发生在文档旁边。</p>
                    </div>
                    <div className={styles.ideFrame} aria-label="文件、原文与助手的并排界面示意">
                        <div className={styles.ideBar}>
                            <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
                            <span className={styles.ideTitle}>linkmai / matters / 024</span>
                            <span className={styles.ideBadge}>审阅中</span>
                        </div>
                        <div className={styles.ideGrid}>
                            <aside className={styles.ideTree}>
                                <p>MATTER 024</p>
                                <span className={styles.ideActive}>股权回购协议.docx</span>
                                <span>董事会决议.pdf</span>
                                <span>投资人清单.xlsx</span>
                                <span>尽调备忘录.md</span>
                                <span>风险清单.md</span>
                                <p>工作流</p>
                                <span>条款比对</span>
                                <span>先例检索</span>
                            </aside>
                            <article className={styles.ideDoc}>
                                <div className={styles.docToolbar}><span>股权回购协议.docx</span><span>修订模式</span></div>
                                <p className={styles.docKicker}>第 3 条 / 回购安排</p>
                                <h3>股权回购协议</h3>
                                <p>3.1 投资方持有公司 12.5% 的股权，对应注册资本人民币 125 万元。</p>
                                <p className={styles.highlight}>3.2 若公司未能在 2027 年 6 月 30 日前完成合格上市，投资方有权要求创始股东按年化 8% 的收益率回购其持有的全部股权。</p>
                                <p>3.3 回购价款应在投资方发出书面通知后三十日内支付完毕。</p>
                                <p className={styles.inserted}>建议补充：回购义务以公司董事会决议为前提，且累计回购金额不超过本轮投资总额的 150%。</p>
                                <p>3.4 因回购产生的税费由各方依法各自承担。</p>
                            </article>
                            <aside className={styles.ideChat}>
                                <p className={styles.panelLabel}>灵迈 / 审阅</p>
                                <div className={styles.chatBubble}>第 3.2 条缺少董事会决议前置程序，回购上限也未约定。已给出补充条款，是否接受？</div>
                                <div className={styles.chatActions}><span>接受修订</span><span>查看依据</span></div>
                                <div className={styles.citation}>《公司法》第 74 条 <span>↗</span></div>
                                <div className={styles.citation}>《九民纪要》第 5 条 <span>↗</span></div>
                                <p className={styles.ideHint}>所有结论都可回到原文核对。</p>
                            </aside>
                        </div>
                    </div>
                </section>

                <section className={styles.capabilities}>
                    <SectionTag index="03">WHAT IT DOES</SectionTag>
                    <div className={styles.capabilityHead}>
                        <h2>把重复劳动，<br /><em>交给可回看的<br />流程。</em></h2>
                        <p>不是替律师做决定，而是把阅读、比对、引用和改写组织成一条能回看的路径。</p>
                    </div>
                    <div className={styles.bento}>
                        <article className={styles.bentoWide}>
                            <div>
                                <span className={styles.bentoIndex}>A / REVIEW</span>
                                <h3>逐条审阅，<br />把风险放到桌面上。</h3>
                                <p>按团队标准逐条检查，标出偏离、缺失与冲突；每条建议都带着原文位置和依据。</p>
                            </div>
                            <div className={styles.clauseStack} aria-hidden="true">
                                <span>3.2 回购触发条件 <b>高</b></span>
                                <span>8.4 优先购买权 <b>中</b></span>
                                <span>12.1 争议解决 <b>低</b></span>
                            </div>
                        </article>
                        <article>
                            <span className={styles.bentoIndex}>B / CITE</span>
                            <h3>每一句，<br />都能回到出处。</h3>
                            <p>引用不是装饰。点开就能看到法条、案例或原文档段落。</p>
                        </article>
                        <article>
                            <span className={styles.bentoIndex}>C / DRAFT</span>
                            <h3>起草与修订，<br />停在同一个文件里。</h3>
                            <p>从空白页开始，或在现有合同上直接改；修订记录留在项目里。</p>
                        </article>
                        <article className={styles.bentoWideDark}>
                            <div>
                                <span className={styles.bentoIndex}>D / WORKFLOW</span>
                                <h3>多步工作流，<br />把判断串起来。</h3>
                                <p>读材料、查先例、比对版本、生成交付件。每一步都能暂停、检查、重跑。</p>
                            </div>
                            <div className={styles.workflowLine} aria-hidden="true">
                                <span>读取</span><i /><span>检索</span><i /><span>比对</span><i /><span>交付</span>
                            </div>
                        </article>
                    </div>
                </section>

                <section className={styles.openSource} id="open-source">
                    <div className={styles.openSourceCopy}>
                        <SectionTag index="04">OPEN BY DEFAULT</SectionTag>
                        <h2>把黑箱，<br /><em>变成可以检查的<br />文本。</em></h2>
                        <p>灵迈以 AGPL-3.0 开源。审查规则、提示词、部署脚本都可以被阅读和替换；没有“仅供演示”的隐藏分支。</p>
                        <div className={styles.auditList}>
                            <span>源代码与提示词公开</span>
                            <span>自托管不依赖厂商</span>
                            <span>数据与模型可替换</span>
                        </div>
                        <a className={styles.textLink} href="https://github.com/zzx680/Linkmai" rel="noreferrer" target="_blank">查看源代码 <span aria-hidden="true">↗</span></a>
                    </div>
                    <div className={styles.terminal} aria-label="自托管命令示例">
                        <div className={styles.terminalTop}><span>linkmai / deploy</span><span>zsh</span></div>
                        <pre><code>{`git clone https://github.com/zzx680/Linkmai
cd Linkmai
cp deploy/env.prod.example deploy/.env.prod
./deploy/scripts/generate-secrets.mjs
./deploy/scripts/compose.sh up -d`}</code></pre>
                        <div className={styles.terminalFoot}><span>AGPL-3.0</span><span>Docker Compose</span><span>PostgreSQL</span></div>
                    </div>
                </section>

                <section className={styles.deploy} id="deploy">
                    <SectionTag index="05">DEPLOY YOUR WAY</SectionTag>
                    <div className={styles.deployHead}>
                        <h2>云端很快，<br /><em>自托管更稳。</em></h2>
                        <p>同一套代码，两种运行方式。可以由我们托管，也可以放进自己的阿里云、私有云或本机。</p>
                    </div>
                    <div className={styles.deployColumns}>
                        <article>
                            <div className={styles.deployTop}><span>托管版</span><span>开箱即用</span></div>
                            <h3>把运维交给平台，<br />团队直接开始。</h3>
                            <ul>
                                <li>注册即用，无需维护服务器</li>
                                <li>自动更新与备份</li>
                                <li>适合小团队快速验证</li>
                            </ul>
                            <Link className={styles.deployCta} href="/signup">开始使用 <span aria-hidden="true">↗</span></Link>
                        </article>
                        <article className={styles.deployDark}>
                            <div className={styles.deployTop}><span>自托管</span><span>数据自持</span></div>
                            <h3>把系统放进<br />自己的边界里。</h3>
                            <ul>
                                <li>阿里云 ECS + 本机 PostgreSQL + OSS</li>
                                <li>支持 DeepSeek 与 OpenAI 兼容模型</li>
                                <li>Docker Compose 一键部署，可审计</li>
                            </ul>
                            <Link className={styles.deployCta} href="/linkmai/deploy">阅读部署文档 <span aria-hidden="true">↗</span></Link>
                        </article>
                    </div>
                </section>

                <section className={styles.quote}>
                    <p className={styles.quoteMark} aria-hidden="true">“</p>
                    <blockquote>法律 AI 的价值，不在于替你说话，而在于让每一句话都有出处。</blockquote>
                    <p className={styles.quoteBy}>灵迈产品原则 · 01</p>
                </section>

                <section className={styles.cta}>
                    <div>
                        <p className={styles.kicker}>START WITH ONE MATTER</p>
                        <h2>把下一份合同，<br /><em>放进灵迈。</em></h2>
                    </div>
                    <div className={styles.ctaActions}>
                        <Link className={styles.primary} href="/signup">进入工作台 <span aria-hidden="true">↗</span></Link>
                        <Link className={styles.secondary} href="/linkmai/contact">和团队聊聊</Link>
                    </div>
                </section>
            </main>

            <footer className={styles.footer}>
                <div className={styles.footerBrand}><Brand /><p>开源法律 AI 工作台<br />为中国的法律工作而做。</p></div>
                <div className={styles.footerCol}><p>产品</p><Link href="/linkmai/product">功能</Link><Link href="/linkmai/workflows">工作流</Link><Link href="/linkmai/deploy">部署</Link></div>
                <div className={styles.footerCol}><p>项目</p><Link href="/linkmai/about">关于</Link><Link href="/linkmai/blog">动态</Link><a href="https://github.com/zzx680/Linkmai" rel="noreferrer" target="_blank">GitHub</a></div>
                <div className={styles.footerCol}><p>联系</p><Link href="/linkmai/contact">联系我们</Link><a href="mailto:support@linkmai.com">support@linkmai.com</a></div>
                <div className={styles.footerBottom}><span>© 2026 灵迈 LinkMai</span><span>AGPL-3.0 · 可自托管</span><Link href="#top">回到顶部 ↑</Link></div>
            </footer>
        </div>
    );
}
