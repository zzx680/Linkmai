"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Ticket, X } from "lucide-react";
import { uiText } from "@linkmai/client";
import {
    authInputUIClassName,
    InputUI,
    PillButtonUI,
} from "@linkmai/ui";
import { SiteLogo } from "@/app/components/site-logo";
import { useAuth } from "@/app/contexts/AuthContext";
import { AuthApiError, signInWithInviteCode } from "@/app/lib/authApi";
import { PRODUCT_SUPPORT_EMAIL } from "@/app/lib/productConfig";
import { cn } from "@/app/lib/utils";

function inviteErrorMessage(error: unknown): string {
    if (error instanceof AuthApiError) {
        if (error.code === "invalid_invite_code") {
            return uiText("邀请码无效，请检查后重试。");
        }
        if (error.code === "invite_login_disabled") {
            return uiText("邀请码登录尚未开启，请联系管理员。");
        }
        if (error.status === 429) {
            return uiText("尝试次数过多，请稍后再试。");
        }
    }
    return uiText("登录未完成，请稍后重试。");
}

export default function LoginPage() {
    const router = useRouter();
    const { isAuthenticated, authLoading, refreshSession } = useAuth();
    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading && isAuthenticated) {
            router.replace("/onboarding/profile");
        }
    }, [authLoading, isAuthenticated, router]);

    async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const trimmed = code.trim();
        if (!trimmed) {
            setError(uiText("请输入邀请码。"));
            return;
        }
        setLoading(true);
        setError(null);
        try {
            await signInWithInviteCode(trimmed);
            await refreshSession();
            router.push("/onboarding/profile");
        } catch (caught) {
            setError(inviteErrorMessage(caught));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-stone-950 px-4 py-10">
            <div aria-hidden="true" className="absolute inset-0">
                <Image
                    src="/mike/hero-waterloo.webp"
                    alt=""
                    fill
                    priority
                    sizes="100vw"
                    className="scale-105 object-cover opacity-70 blur-[3px]"
                />
                <div className="absolute inset-0 bg-stone-950/40" />
            </div>

            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="login-title"
                className="relative z-10 w-full max-w-[420px] overflow-hidden rounded-[20px] border border-white/40 bg-white shadow-[0_30px_80px_-24px_rgba(0,0,0,0.55)]"
            >
                <div className="flex items-center justify-between px-6 pb-2 pt-5">
                    <SiteLogo size="md" asLink />
                    <div className="flex items-center gap-2">
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
                            {uiText("内测中")}
                        </span>
                        <Link
                            href="/"
                            aria-label={uiText("关闭登录窗口")}
                            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    </div>
                </div>

                <div className="px-6 pb-8 pt-2">
                    <h1 id="login-title" className="font-serif text-2xl text-gray-950">
                        {uiText("登录灵迈")}
                    </h1>
                    <p className="mt-1.5 text-sm leading-6 text-gray-500">
                        {uiText("邀请制内测阶段，输入邀请码即可进入。")}
                    </p>

                    <form onSubmit={handleInvite} className="mt-6 space-y-4">
                        <div className="space-y-2">
                            <label
                                htmlFor="invite-code"
                                className="flex items-center gap-2 text-sm font-medium text-gray-900"
                            >
                                <Ticket className="h-4 w-4 text-gray-500" aria-hidden="true" />
                                {uiText("邀请码")}
                            </label>
                            <InputUI
                                id="invite-code"
                                name="invite-code"
                                value={code}
                                onChange={(event) => setCode(event.target.value.toUpperCase())}
                                placeholder={uiText("请输入邀请码")}
                                autoComplete="one-time-code"
                                autoCapitalize="characters"
                                spellCheck={false}
                                autoFocus
                                maxLength={128}
                                disabled={loading}
                                aria-invalid={error ? true : undefined}
                                aria-describedby={error ? "invite-error" : "invite-hint"}
                                className={cn("w-full", authInputUIClassName)}
                            />
                        </div>
                        {error ? (
                            <p id="invite-error" role="alert" className="text-sm text-red-600">
                                {error}
                            </p>
                        ) : (
                            <p id="invite-hint" className="text-xs leading-5 text-gray-500">
                                {uiText("邀请码不区分大小写。内测阶段仅限受邀用户使用。")}
                            </p>
                        )}
                        <PillButtonUI
                            type="submit"
                            tone="black"
                            size="normal"
                            disabled={loading}
                            className="w-full"
                        >
                            <span className="inline-flex items-center gap-2">
                                {loading ? uiText("正在进入…") : uiText("进入灵迈")}
                                {!loading ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
                            </span>
                        </PillButtonUI>
                    </form>

                    <div className="mt-6 border-t border-gray-200 pt-4">
                        <p className="text-center text-xs leading-5 text-gray-500">
                            {uiText("内测阶段，仅限受邀用户使用。")}
                            {PRODUCT_SUPPORT_EMAIL ? (
                                <>
                                    {" "}
                                    {uiText("遇到问题请联系")}{" "}
                                    <a
                                        className="font-medium text-gray-800 underline underline-offset-4"
                                        href={`mailto:${PRODUCT_SUPPORT_EMAIL}`}
                                    >
                                        {PRODUCT_SUPPORT_EMAIL}
                                    </a>
                                </>
                            ) : null}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
