"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, QrCode, Smartphone, Ticket } from "lucide-react";
import { uiText } from "@linkmai/client";
import {
    authGlassCardUIClassName,
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
        <div className="relative flex min-h-dvh items-center justify-center bg-[#f4f4f1] px-4 py-12 sm:px-6">
            <div className={cn(authGlassCardUIClassName, "w-full max-w-4xl overflow-hidden p-0")}>
                <div className="flex items-center justify-between border-b border-gray-200/80 px-6 py-5 sm:px-10">
                    <SiteLogo size="md" asLink />
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                        {uiText("内测中")}
                    </span>
                </div>

                <div className="px-6 pb-8 pt-7 sm:px-10 sm:pb-10">
                    <div className="mb-8">
                        <h1 className="font-serif text-3xl text-gray-950 sm:text-4xl">
                            {uiText("登录灵迈")}
                        </h1>
                        <p className="mt-2 text-sm text-gray-500">
                            {uiText("邀请制内测阶段。微信与手机号登录即将开放。")}
                        </p>
                    </div>

                    <div className="grid gap-8 md:grid-cols-2 md:gap-0 md:divide-x md:divide-gray-200">
                        <section className="md:pr-10" aria-labelledby="wechat-login-title">
                            <div className="flex items-center gap-2">
                                <QrCode className="h-4 w-4 text-gray-700" aria-hidden="true" />
                                <h2 id="wechat-login-title" className="text-sm font-medium text-gray-900">
                                    {uiText("微信扫码登录")}
                                </h2>
                            </div>
                            <div className="mt-5 flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50/70 px-6 py-9">
                                <div className="flex h-28 w-28 items-center justify-center rounded-xl bg-white text-gray-300 shadow-sm">
                                    <QrCode className="h-16 w-16" strokeWidth={1.2} aria-hidden="true" />
                                </div>
                                <p className="mt-5 text-sm font-medium text-gray-700">
                                    {uiText("微信扫码")}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                    {uiText("即将开放")}
                                </p>
                            </div>
                            <p className="mt-3 text-center text-xs text-gray-400">
                                {uiText("内测期间暂不启用")}
                            </p>
                        </section>

                        <section className="md:pl-10" aria-labelledby="phone-login-title">
                            <div className="flex items-center gap-2">
                                <Smartphone className="h-4 w-4 text-gray-700" aria-hidden="true" />
                                <h2 id="phone-login-title" className="text-sm font-medium text-gray-900">
                                    {uiText("手机号登录")}
                                </h2>
                            </div>
                            <div className="mt-5 space-y-4 opacity-60">
                                <div className="flex gap-2">
                                    <div className="flex h-11 shrink-0 items-center rounded-2xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500">
                                        +86
                                    </div>
                                    <InputUI
                                        disabled
                                        aria-label={uiText("手机号")}
                                        placeholder={uiText("请输入手机号")}
                                        className={cn("w-full", authInputUIClassName)}
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <InputUI
                                        disabled
                                        aria-label={uiText("验证码")}
                                        placeholder={uiText("6 位验证码")}
                                        className={cn("w-full", authInputUIClassName)}
                                    />
                                    <PillButtonUI
                                        type="button"
                                        tone="white"
                                        size="normal"
                                        disabled
                                        className="shrink-0 whitespace-nowrap px-3"
                                    >
                                        {uiText("发送验证码")}
                                    </PillButtonUI>
                                </div>
                                <PillButtonUI
                                    type="button"
                                    tone="black"
                                    size="normal"
                                    disabled
                                    className="w-full"
                                >
                                    {uiText("登录")}
                                </PillButtonUI>
                            </div>
                            <p className="mt-3 text-center text-xs text-gray-400">
                                {uiText("短信服务报备中，即将开放")}
                            </p>
                        </section>
                    </div>

                    <div className="mt-8 border-t border-gray-200 pt-7">
                        <div className="mb-4 flex items-center gap-2">
                            <Ticket className="h-4 w-4 text-gray-700" aria-hidden="true" />
                            <h2 className="text-sm font-medium text-gray-900">
                                {uiText("使用邀请码进入")}
                            </h2>
                        </div>
                        <form onSubmit={handleInvite} className="space-y-3">
                            <InputUI
                                id="invite-code"
                                name="invite-code"
                                value={code}
                                onChange={(event) => setCode(event.target.value.toUpperCase())}
                                placeholder={uiText("请输入邀请码")}
                                autoComplete="one-time-code"
                                autoCapitalize="characters"
                                spellCheck={false}
                                disabled={loading}
                                aria-describedby={error ? "invite-error" : undefined}
                                className={cn("w-full", authInputUIClassName)}
                            />
                            {error ? (
                                <p id="invite-error" role="alert" className="text-sm text-red-600">
                                    {error}
                                </p>
                            ) : (
                                <p className="text-xs text-gray-500">
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
                    </div>

                    <p className="mt-6 text-center text-xs leading-6 text-gray-500">
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
    );
}
