import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "定价｜灵迈 LinkMai",
    description: "灵迈 LinkMai 内测阶段免费；正式版按席位订阅，包含每月模型额度。",
};

const plans = [
    {
        name: "内测版",
        price: "¥0",
        unit: "内测期间",
        badge: "现在可用",
        description: "受邀用户免费使用全部核心功能。",
        features: ["全部核心功能", "灵迈内置模型（合理使用）", "个人与团队工作区", "邀请码登录"],
        cta: "使用邀请码进入",
        href: "/login",
        featured: true,
    },
    {
        name: "个人版",
        price: "¥129",
        unit: "/ 月",
        badge: "正式版",
        description: "适合独立执业律师与小型法务。",
        features: ["1 个席位", "每月含模型额度", "案卷、审阅与起草", "邮件支持"],
        cta: "预约演示",
        href: "/linkmai/contact",
        featured: false,
    },
    {
        name: "团队版",
        price: "¥399",
        unit: "/ 席位 / 月",
        badge: "3 席起",
        description: "适合律所团队与企业法务部门。",
        features: ["共享案卷与工作流", "成员与权限管理", "用量统计", "优先支持"],
        cta: "预约演示",
        href: "/linkmai/contact",
        featured: false,
    },
] as const;

export default function PricingPage() {
    return (
        <main className="mx-auto max-w-6xl px-6 pb-24 pt-16 md:pt-24">
            <div className="max-w-3xl">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-stone-500">Pricing / 内测定价</p>
                <h1 className="mt-5 font-serif text-4xl leading-[1.05] tracking-tight text-stone-950 sm:text-5xl md:text-6xl">
                    先免费，
                    <br />
                    <span className="text-stone-400">再按团队规模付费。</span>
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-relaxed text-stone-600">
                    内测阶段不收费。正式版按席位订阅，每个席位包含每月模型额度；超出部分按量计费。自托管版本不收取平台订阅费，模型费用由你自己的 Key 承担。
                </p>
            </div>

            <div className="mt-9 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-4">
                <p className="text-sm font-medium text-emerald-900">内测期间，全部受邀用户免费</p>
                <p className="mt-1 text-sm leading-relaxed text-emerald-800/80">
                    正式收费前至少提前 30 天通知；内测用户保留早期价格。下面价格是拟定方案，正式发布前以订阅协议为准。
                </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
                {plans.map((plan) => (
                    <article
                        className={`flex flex-col rounded-3xl border p-6 ${
                            plan.featured
                                ? "border-stone-900 bg-stone-900 text-white"
                                : "border-stone-200 bg-white text-stone-950"
                        }`}
                        key={plan.name}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <h2 className="font-serif text-2xl">{plan.name}</h2>
                            <span
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                    plan.featured
                                        ? "bg-white/10 text-stone-100"
                                        : "border border-stone-200 text-stone-500"
                                }`}
                            >
                                {plan.badge}
                            </span>
                        </div>
                        <p className={`mt-4 text-sm ${plan.featured ? "text-stone-300" : "text-stone-500"}`}>{plan.description}</p>
                        <p className="mt-6 flex items-baseline gap-1">
                            <span className="font-serif text-4xl">{plan.price}</span>
                            <span className={`text-sm ${plan.featured ? "text-stone-300" : "text-stone-500"}`}>{plan.unit}</span>
                        </p>
                        <ul className={`mt-6 space-y-2.5 text-sm ${plan.featured ? "text-stone-200" : "text-stone-600"}`}>
                            {plan.features.map((feature) => (
                                <li className="flex gap-2" key={feature}>
                                    <span aria-hidden="true" className={plan.featured ? "text-emerald-300" : "text-emerald-600"}>✓</span>
                                    <span>{feature}</span>
                                </li>
                            ))}
                        </ul>
                        <Link
                            className={`mt-8 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-80 ${
                                plan.featured ? "bg-white !text-stone-900" : "bg-stone-900 !text-white"
                            }`}
                            href={plan.href}
                        >
                            {plan.cta}
                        </Link>
                    </article>
                ))}
            </div>

            <div className="mt-4 flex flex-col gap-4 rounded-3xl border border-stone-200 bg-stone-50 p-6 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="font-serif text-2xl text-stone-950">企业版</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
                        私有化部署、专有模型、SSO 与审计、数据隔离、迁移与培训。按年定制，联系销售获取方案与 SLA。
                    </p>
                </div>
                <Link
                    className="inline-flex shrink-0 items-center justify-center rounded-full border border-stone-900 px-5 py-2.5 text-sm font-medium text-stone-900 transition-colors hover:bg-stone-900 hover:text-white"
                    href="/linkmai/contact"
                >
                    联系我们
                </Link>
            </div>

            <p className="mt-8 text-xs leading-relaxed text-stone-400">
                官网托管版含内置模型额度；自托管版不收取平台订阅费。模型额度、超出用量与发票细则将在正式版发布时公布。
            </p>
        </main>
    );
}
