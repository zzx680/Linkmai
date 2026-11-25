"use client";

import { uiText } from "@mike/client";

import { PolicyNotice } from "@/app/components/auth/PolicyNotice";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signup } from "@/app/lib/authApi";
import {
    InputUI,
    PillButtonUI,
    pillButtonUIClassName,
    noticeActionClassName,
    authGlassCardUIClassName,
    authInputUIClassName,
    AuthDividerUI,
} from "@mike/ui";
import Link from "next/link";
import { SiteLogo } from "@/app/components/site-logo";
import { useAuth } from "@/app/contexts/AuthContext";
import { cn } from "@/app/lib/utils";
import { WarningPopup } from "@/app/components/popups/WarningPopup";
import {
    reportFault,
    UserVisibleError,
    describeError,
    supportMailtoFor,
    type UserFacingError,
} from "@/app/lib/userFacingError";


/** A failure the form found itself, so the text is already user-facing. */
function localSignupError(message: string): UserFacingError {
    return describeError(
        new UserVisibleError(message, { kind: "validation" }),
        { action: uiText("create your account") },
    );
}

/**
 * Shown instead of the form while this deployment cannot send confirmation
 * emails (a new Vercel deployment before its operator configures email):
 * an account created now could never be confirmed. Same sentence as the
 * API's `signup_email_not_configured` refusal.
 */
const SIGNUP_CLOSED_MESSAGE =
    uiText("当前灵迈服务暂未开放注册，因为尚未配置") +
    uiText("验证邮件，请联系管理员配置邮件服务，或") +
    uiText("使用已有账户登录。");

/**
 * The shared auth table with this screen's deltas. Anything not listed
 * falls through to `describeError` so a 429, a 5xx, or a dropped connection
 * still says what actually happened.
 */
const SIGNUP_ERROR_MESSAGES = authMessages({
    validation_failed: "Check your email address and password and try again.",
    invalid_request: "Check your email address and password and try again.",
    over_email_send_rate_limit:
        "Too many signup emails have been requested. Wait a few minutes and try again.",
    request_timeout: "The signup request timed out. Try again.",
    signup_email_not_configured: SIGNUP_CLOSED_MESSAGE,
});

/** Classify a signup failure into text a person can act on. */
function describeSignupError(error: unknown): UserFacingError {
    const described = reportFault(error, {
        action: uiText("create your account"),
        codeMessages: SIGNUP_ERROR_MESSAGES,
        fallback: uiText("暂时无法创建账户，请重试。"),
        operation: "auth.signup",
    });
    return described.kind === "rate_limited"
        ? { ...described, message: TOO_MANY_ATTEMPTS_MESSAGE }
        : described;
}
import {
    MIN_PASSWORD_LENGTH,
    isPasswordTooLong,
    maximumPasswordMessage,
    minimumPasswordMessage,
} from "@/app/components/auth/passwordPolicy";
import { TOO_MANY_ATTEMPTS_MESSAGE, authMessages } from "@/app/lib/authMessages";
import { GoogleAuthButton } from "@/app/components/auth/GoogleAuthButton";
import { useSignInOptions } from "@/app/hooks/useSignInOptions";
import { FieldLabel } from "@/app/components/ui/form-field";

function SignupContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { isAuthenticated, authLoading, refreshSession } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<UserFacingError | null>(null);
    const [success, setSuccess] = useState(false);
    const isAccountCreatedPreview =
        process.env.NODE_ENV !== "production" &&
        searchParams.get("preview") === "account-created";
    const {
        options: signInOptions,
        loaded: signInOptionsLoaded,
        providersKnown,
    } = useSignInOptions();
    const showGoogle = providersKnown && signInOptions.google;

    // A new deployment has no accounts yet: its first account is created on
    // the setup screen, which needs no confirmation email.
    useEffect(() => {
        if (signInOptions.setupRequired) router.replace("/setup");
    }, [router, signInOptions.setupRequired]);

    useEffect(() => {
        if (isAccountCreatedPreview) return;
        if (!authLoading && isAuthenticated && !loading && !success) {
            router.replace("/onboarding/profile");
        }
    }, [
        authLoading,
        isAccountCreatedPreview,
        isAuthenticated,
        loading,
        router,
        success,
    ]);

    useEffect(() => {
        if (!success) return;
        const timer = setTimeout(() => {
            router.push("/onboarding/profile");
        }, 2000);
        return () => clearTimeout(timer);
    }, [router, success]);

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Validate passwords match
        if (password !== confirmPassword) {
            setError(localSignupError("The two passwords don't match."));
            setLoading(false);
            return;
        }

        // Validate password length. The upper bound is bcrypt's 72 BYTES:
        // GoTrue rejects anything longer, so say so before the round trip.
        if (password.length < MIN_PASSWORD_LENGTH) {
            setError(localSignupError(`${minimumPasswordMessage}.`));
            setLoading(false);
            return;
        }
        if (isPasswordTooLong(password)) {
            setError(localSignupError(maximumPasswordMessage));
            setLoading(false);
            return;
        }

        try {
            const trimmedEmail = email.trim();
            const result = await signup(
                trimmedEmail,
                password,
                "/onboarding/profile",
            );

            if (!result.requiresEmailConfirmation) {
                await refreshSession();
                setSuccess(true);
            } else {
                router.push("/signup/check-email");
            }
        } catch (caught: unknown) {
            setError(describeSignupError(caught));
        } finally {
            setLoading(false);
        }
    };

    // Success View
    if (success || isAccountCreatedPreview) {
        return (
            <div className="relative flex min-h-dvh items-center justify-center bg-gray-50/80 px-6 py-10">
                <div className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2">
                    <SiteLogo size="lg" asLink />
                </div>
                <div className="w-full max-w-md">
                    <div className={authGlassCardUIClassName}>
                        <h1 className="font-serif text-2xl font-medium text-gray-950">
                            {uiText("账户已创建")}
                        </h1>
                        <p className="mt-3 text-sm leading-relaxed text-gray-600">
                            {uiText("正在跳转以完成账户设置…")}
                        </p>
                        <Link
                            href="/onboarding/profile"
                            className={pillButtonUIClassName({
                                tone: "black",
                                size: "normal",
                                className: "mt-6",
                            })}
                        >
                            {uiText("继续")}
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (signInOptionsLoaded && !signInOptions.signup) {
        return (
            <div className="relative flex min-h-dvh items-center justify-center bg-gray-50/80 px-6 py-24">
                <div className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2">
                    <SiteLogo size="lg" asLink />
                </div>
                <div className="w-full max-w-md">
                    <div className={authGlassCardUIClassName}>
                        <h1 className="font-serif text-2xl font-medium text-gray-950">
                            {uiText("暂未开放注册")}
                        </h1>
                        <p className="mt-3 text-sm leading-relaxed text-gray-600">{uiText("当前灵迈服务尚未配置验证邮件，请联系管理员配置邮件服务，或使用已有账户登录。")}</p>
                        <Link
                            href="/login"
                            className={pillButtonUIClassName({
                                tone: "black",
                                size: "normal",
                                className: "mt-6",
                            })}
                        >
                            {uiText("Log in")}
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // Default Signup Form View
    return (
        <div className="relative flex min-h-dvh items-center justify-center bg-gray-50/80 px-6 py-24">
            <div className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2">
                <SiteLogo size="lg" asLink />
            </div>
            <div className="w-full max-w-md">
                <div className={cn(authGlassCardUIClassName, "mb-4")}>
                    <h2 className="mb-6 text-left text-2xl font-medium font-serif text-gray-950">
                        {uiText("Sign Up")}
                    </h2>

                    <form onSubmit={handleSignup} className="space-y-4">
                        <div>
                            <FieldLabel htmlFor="email">
                                {uiText("邮箱")}
                            </FieldLabel>
                            <InputUI
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className={`w-full ${authInputUIClassName}`}
                            />
                        </div>

                        <div>
                            <FieldLabel htmlFor="password">
                                {uiText("密码")}
                            </FieldLabel>
                            <InputUI
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={uiText`Min. ${MIN_PASSWORD_LENGTH} Characters`}
                                required
                                className={`w-full ${authInputUIClassName}`}
                            />
                        </div>

                        <div>
                            <FieldLabel htmlFor="confirmPassword">
                                {uiText("Confirm Password")}
                            </FieldLabel>
                            <InputUI
                                id="confirmPassword"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) =>
                                    setConfirmPassword(e.target.value)
                                }
                                required
                                className={`w-full ${authInputUIClassName}`}
                            />
                        </div>

                        <div className="space-y-3 pt-2">
                            <PolicyNotice />
                            <PillButtonUI
                                type="submit"
                                tone="black"
                                size="normal"
                                disabled={loading}
                                className="w-full"
                            >
                                {loading ? uiText("正在创建账户…") : uiText("Sign up")}
                            </PillButtonUI>
                            {showGoogle && (
                                <>
                                    <AuthDividerUI />
                                    <GoogleAuthButton
                                        onError={setError}
                                        disabled={loading}
                                        onLoadingChange={setLoading}
                                    />
                                </>
                            )}
                        </div>
                    </form>
                </div>
                <div className="text-center text-sm text-gray-500">
                    {uiText("已有账户？")}{" "}
                    <Link
                        href="/login"
                        className="font-medium transition-colors hover:text-gray-950"
                    >
                        {uiText("Log in")}
                    </Link>
                </div>
            </div>
            <WarningPopup
                open={!!error}
                onClose={() => setError(null)}
                title={error?.title}
                message={error?.message}
                actions={
                    error?.supportable ? (
                        <a
                            href={supportMailtoFor(
                                error,
                                "Failed to create an account.",
                            )}
                            className={noticeActionClassName()}
                        >
                            {uiText("联系支持")}
                        </a>
                    ) : undefined
                }
            />
        </div>
    );
}

export default function SignupPage() {
    return (
        <Suspense fallback={null}>
            <SignupContent />
        </Suspense>
    );
}
