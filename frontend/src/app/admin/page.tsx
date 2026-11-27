"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
    AdminApiError,
    adminLogout,
    createAdminInviteCode,
    getAdminContactMessages,
    getAdminInviteCodes,
    setAdminInviteCodeActive,
    setAdminMessageResponded,
    type AdminContactMessage,
    type AdminInviteCode,
} from "@/app/lib/adminApi";

function formatDate(value: string | null) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}

export default function AdminPage() {
    const router = useRouter();
    const [codes, setCodes] = useState<AdminInviteCode[]>([]);
    const [messages, setMessages] = useState<AdminContactMessage[]>([]);
    const [tab, setTab] = useState<"codes" | "messages">("codes");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [label, setLabel] = useState("");
    const [maxUses, setMaxUses] = useState("1");
    const [expires, setExpires] = useState("");
    const [createdCode, setCreatedCode] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    const load = useCallback(async () => {
        try {
            const [nextCodes, nextMessages] = await Promise.all([
                getAdminInviteCodes(),
                getAdminContactMessages(),
            ]);
            setCodes(nextCodes);
            setMessages(nextMessages);
            setError(null);
        } catch (caught) {
            if (caught instanceof AdminApiError && caught.status === 401) {
                router.replace("/admin/login");
                return;
            }
            setError("数据加载失败，请稍后重试。");
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        void load();
    }, [load]);

    async function createCode(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setCreating(true);
        setError(null);
        try {
            const result = await createAdminInviteCode({
                label: label.trim(),
                maxUses: Math.max(1, Number.parseInt(maxUses, 10) || 1),
                expiresAt: expires ? new Date(expires).toISOString() : null,
            });
            setCodes((current) => [result.invite, ...current]);
            setCreatedCode(result.code);
            setLabel("");
            setMaxUses("1");
            setExpires("");
        } catch {
            setError("邀请码创建失败。");
        } finally {
            setCreating(false);
        }
    }

    async function toggleCode(code: AdminInviteCode) {
        try {
            await setAdminInviteCodeActive(code.id, !code.active);
            setCodes((current) =>
                current.map((item) => (item.id === code.id ? { ...item, active: !item.active } : item)),
            );
        } catch {
            setError("邀请码状态更新失败。");
        }
    }

    async function toggleMessage(message: AdminContactMessage) {
        const responded = !message.responded_at;
        try {
            await setAdminMessageResponded(message.id, responded);
            setMessages((current) =>
                current.map((item) =>
                    item.id === message.id
                        ? { ...item, responded_at: responded ? new Date().toISOString() : null }
                        : item,
                ),
            );
        } catch {
            setError("反馈状态更新失败。");
        }
    }

    async function copyCode() {
        if (!createdCode) return;
        try {
            await navigator.clipboard.writeText(createdCode);
        } catch {
            // The code stays visible; copying is only a convenience.
        }
    }

    return (
        <main className="mx-auto max-w-6xl px-6 py-10">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs tracking-[0.18em] text-stone-500">LINKMAI / ADMIN</p>
                    <h1 className="mt-2 text-3xl font-medium">管理后台</h1>
                    <p className="mt-2 text-sm text-stone-500">邀请码与官网联系表单</p>
                </div>
                <button
                    className="rounded-full border border-stone-300 px-4 py-2 text-sm text-stone-600"
                    onClick={() => void adminLogout().then(() => router.replace("/admin/login"))}
                    type="button"
                >
                    退出
                </button>
            </header>

            {error ? (
                <p className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
            ) : null}

            <div className="mt-8 flex gap-2">
                <button
                    className={`rounded-full px-4 py-2 text-sm ${tab === "codes" ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"}`}
                    onClick={() => setTab("codes")}
                    type="button"
                >
                    邀请码 {codes.length}
                </button>
                <button
                    className={`rounded-full px-4 py-2 text-sm ${tab === "messages" ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"}`}
                    onClick={() => setTab("messages")}
                    type="button"
                >
                    用户反馈 {messages.length}
                </button>
            </div>

            {loading ? <p className="mt-10 text-sm text-stone-500">加载中…</p> : null}

            {!loading && tab === "codes" ? (
                <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
                    <section className="rounded-3xl bg-white p-6 ring-1 ring-stone-200">
                        <h2 className="text-lg font-medium">新建邀请码</h2>
                        <p className="mt-1 text-xs leading-5 text-stone-500">创建后只展示一次明文，之后只显示使用情况。</p>
                        <form className="mt-5 space-y-4" onSubmit={createCode}>
                            <label className="block text-sm text-stone-600">
                                备注
                                <input
                                    className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2"
                                    onChange={(event) => setLabel(event.target.value)}
                                    placeholder="例如：11 月内测"
                                    value={label}
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="block text-sm text-stone-600">
                                    可用次数
                                    <input
                                        className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2"
                                        min={1}
                                        onChange={(event) => setMaxUses(event.target.value)}
                                        type="number"
                                        value={maxUses}
                                    />
                                </label>
                                <label className="block text-sm text-stone-600">
                                    过期时间
                                    <input
                                        className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs"
                                        onChange={(event) => setExpires(event.target.value)}
                                        type="datetime-local"
                                        value={expires}
                                    />
                                </label>
                            </div>
                            <button
                                className="w-full rounded-full bg-stone-900 px-4 py-2.5 text-sm text-white disabled:opacity-50"
                                disabled={creating}
                                type="submit"
                            >
                                {creating ? "创建中…" : "生成邀请码"}
                            </button>
                        </form>
                        {createdCode ? (
                            <div className="mt-5 rounded-2xl bg-amber-50 p-4">
                                <p className="text-xs text-amber-800">新邀请码，只显示一次</p>
                                <div className="mt-2 flex items-center gap-2">
                                    <code className="flex-1 break-all text-sm font-medium text-amber-950">{createdCode}</code>
                                    <button className="text-xs text-amber-800 underline" onClick={() => void copyCode()} type="button">
                                        复制
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </section>

                    <section className="space-y-3">
                        {codes.length === 0 ? (
                            <p className="rounded-3xl bg-white p-6 text-sm text-stone-500 ring-1 ring-stone-200">还没有邀请码。</p>
                        ) : null}
                        {codes.map((code) => (
                            <article className="rounded-3xl bg-white p-5 ring-1 ring-stone-200" key={code.id}>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-medium">{code.label || "未命名邀请码"}</p>
                                        <p className="mt-1 text-xs text-stone-500">
                                            {code.uses} / {code.max_uses} 次 · 创建 {formatDate(code.created_at)}
                                            {code.expires_at ? ` · 到期 ${formatDate(code.expires_at)}` : ""}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`rounded-full px-2.5 py-1 text-xs ${code.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>
                                            {code.active ? "启用" : "停用"}
                                        </span>
                                        <button
                                            className="rounded-full border border-stone-300 px-3 py-1.5 text-xs text-stone-600"
                                            onClick={() => void toggleCode(code)}
                                            type="button"
                                        >
                                            {code.active ? "停用" : "启用"}
                                        </button>
                                    </div>
                                </div>
                                {code.last_used_at ? <p className="mt-2 text-xs text-stone-400">最近使用 {formatDate(code.last_used_at)}</p> : null}
                            </article>
                        ))}
                    </section>
                </div>
            ) : null}

            {!loading && tab === "messages" ? (
                <section className="mt-6 space-y-3">
                    {messages.length === 0 ? (
                        <p className="rounded-3xl bg-white p-6 text-sm text-stone-500 ring-1 ring-stone-200">还没有反馈。</p>
                    ) : null}
                    {messages.map((message) => (
                        <article className="rounded-3xl bg-white p-5 ring-1 ring-stone-200" key={message.id}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium">{message.name || "匿名"} · {message.email}</p>
                                    <p className="mt-1 text-xs text-stone-500">
                                        {message.subject || "无主题"} · {formatDate(message.created_at)}
                                    </p>
                                </div>
                                <button
                                    className={`rounded-full px-3 py-1.5 text-xs ${message.responded_at ? "bg-emerald-50 text-emerald-700" : "border border-stone-300 text-stone-600"}`}
                                    onClick={() => void toggleMessage(message)}
                                    type="button"
                                >
                                    {message.responded_at ? "已联系" : "标记已联系"}
                                </button>
                            </div>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-700">{message.message}</p>
                            <div className="mt-3 flex flex-wrap gap-3 text-xs text-stone-500">
                                <a className="underline" href={`mailto:${message.email}`}>回复邮件</a>
                                <span>{message.responded_at ? `已联系 ${formatDate(message.responded_at)}` : "未联系"}</span>
                            </div>
                        </article>
                    ))}
                </section>
            ) : null}
        </main>
    );
}
