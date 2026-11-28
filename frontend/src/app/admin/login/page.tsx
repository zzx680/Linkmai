"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { adminLogin, AdminApiError } from "@/app/lib/adminApi";
import { SiteLogo } from "@/app/components/site-logo";

export default function AdminLoginPage() {
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setSending(true);
        try {
            await adminLogin(password);
            router.replace("/admin");
        } catch (caught) {
            setError(
                caught instanceof AdminApiError && caught.status === 401
                    ? "密码不正确。"
                    : "登录失败，请确认后台已配置管理员密码。",
            );
        } finally {
            setSending(false);
        }
    }

    return (
        <main className="flex min-h-dvh items-center justify-center px-6 py-16">
            <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-sm ring-1 ring-stone-200">
                <SiteLogo size="md" />
                <h1 className="mt-4 text-2xl font-medium">管理后台</h1>
                <p className="mt-2 text-sm text-stone-500">管理邀请码并查看官网联系表单。</p>
                <label className="mt-7 block text-sm text-stone-700">
                    管理员密码
                    <input
                        autoComplete="current-password"
                        className="mt-2 w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 outline-none focus:border-stone-400"
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        type="password"
                        value={password}
                    />
                </label>
                {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
                <button
                    className="mt-6 w-full rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
                    disabled={sending}
                    type="submit"
                >
                    {sending ? "登录中…" : "进入后台"}
                </button>
            </form>
        </main>
    );
}
