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
import { PhoneAuthForm } from "@/app/components/auth/PhoneAuthForm";
import { WeChatAuthButton } from "@/app/components/auth/WeChatAuthButton";
import { useAuth } from "@/app/contexts/AuthContext";
import { useSignInOptions } from "@/app/hooks/useSignInOptions";
import { AuthApiError, signInWithInviteCode } from "@/app/lib/authApi";
import { cn } from "@/app/lib/utils";

const LOGIN_SUPPORT_EMAIL = "hk.charlie@163.com";
const AFTER_SIGN_IN = "/onboarding/profile";

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

/** Server answers from the phone endpoints, in the wording a user can act on. */
function phoneErrorMessage(error: unknown): string {
    if (error instanceof AuthApiError) {
        if (error.code === "phone_signin_disabled") {
            return uiText("手机号登录尚未配置，请联系管理员。");
        }
        if (error.status === 429) {
            return uiText("发送过于频繁，请稍后再试。");
        }
        if (error.code === "otp_expired" || error.code === "invalid_otp") {
            return uiText("验证码无效或已过期，请重新获取。");
        }
    }
    return uiText("登录未完成，请稍后重试。");
}

export default function LoginPage() {
    const router = useRouter();
    const { isAuthenticated, authLoading, refreshSession } = useAuth();
    const { options, loaded } = useSignInOptions();
    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [inviteOpen, setInviteOpen] = useState(false);

    useEffect(() => {
        if (!authLoading && isAuthenticated) {
            router.replace(AFTER_SIGN_IN);
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
            router.push(AFTER_SIGN_IN);
        } catch (caught) {
            setError(inviteErrorMessage(caught));
        } finally {
            setLoading(false);
        }
    }

    async function handlePhoneAuthenticated() {
        await refreshSession();
        router.push(AFTER_SIGN_IN);
    }

    // Before the deployment answers, keep the invite form: it is the one route
    // that never depends on a provider this build cannot see.
    const phoneAvailable = loaded && options.phone;
    const wechatAvailable = loaded && options.wechat;
    const inviteAvailable = !loaded || options.invite;
    const showInviteForm = inviteAvailable && (inviteOpen || !phoneAvailable);
    const noProvider = loaded && !options.phone && !options.wechat;

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
                <div className="flex items-center justify-between px-6 pb-1 pt-5">
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

                <div className="px-6 pb-7 pt-1">
                    <h1 id="login-title" className="font-serif text-2xl text-gray-950">
                        {uiText("登录灵迈")}
                    </h1>

                    {phoneAvailable ? (
                        <div className="mt-7">
                            <PhoneAuthForm
                                purpose="login"
                                onAuthenticated={handlePhoneAuthenticated}
                                onError={(caught) => setError(phoneErrorMessage(caught))}
                            />
                        </div>
                    ) : null}

                    {wechatAvailable ? (
                        <div className="mt-5 space-y-4">
                            {phoneAvailable ? (
                                <div className="flex items-center gap-3">
                                    <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
                                    <span className="text-xs text-gray-400">{uiText("或")}</span>
                                    <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
                                </div>
                            ) : null}
                            <WeChatAuthButton next={AFTER_SIGN_IN} />
                        </div>
                    ) : null}

                    {noProvider ? (
                        <p className="mt-6 rounded-2xl bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600 ring-1 ring-stone-200">
                            {uiText("手机号与微信登录即将开放。")}
                        </p>
                    ) : null}

                    {error ? (
                        <p role="alert" className="mt-4 text-sm text-red-600">
                            {error}
                        </p>
                    ) : null}

                    {showInviteForm ? (
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
                                    maxLength={128}
                                    disabled={loading}
                                    aria-invalid={error ? true : undefined}
                                    className={cn("w-full", authInputUIClassName)}
                                />
                            </div>
                            <PillButtonUI
                                type="submit"
                                tone="black"
                                size="normal"
                                disabled={loading}
                                className="w-full"
                            >
                                <span className="inline-flex items-center gap-2">
                                    {loading ? uiText("正在进入…") : uiText("进入灵迈")}
                                    {!loading ? (
                                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                    ) : null}
                                </span>
                            </PillButtonUI>
                        </form>
                    ) : null}

                    {inviteAvailable && !showInviteForm ? (
                        <button
                            type="button"
                            onClick={() => {
                                setError(null);
                                setInviteOpen(true);
                            }}
                            className="mt-5 block w-full text-center text-xs font-medium text-gray-500 underline underline-offset-4 transition hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                        >
                            {uiText("有邀请码？用邀请码进入")}
                        </button>
                    ) : null}

                    <div className="mt-6 border-t border-gray-200 pt-4">
                        <p className="text-center text-xs leading-5 text-gray-500">
                            {uiText("内测阶段，仅限受邀用户使用。")}
                            {" "}
                            {uiText("遇到问题请联系")}{" "}
                            <a
                                className="font-medium text-gray-800 underline underline-offset-4"
                                href={`mailto:${LOGIN_SUPPORT_EMAIL}`}
                            >
                                {LOGIN_SUPPORT_EMAIL}
                            </a>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
