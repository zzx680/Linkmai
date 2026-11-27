"use client";

import { uiText } from "@linkmai/client";
import { useEffect, useRef, useState } from "react";
import {
    InputUI,
    PillButtonUI,
    authInputUIClassName,
} from "@linkmai/ui";
import { FieldLabel } from "@/app/components/ui/form-field";
import { startPhoneSignIn, verifyPhoneSignIn } from "@/app/lib/authApi";

const RESEND_SECONDS = 60;
const PHONE_LENGTH = 11;

interface PhoneAuthFormProps {
    purpose: "login" | "signup";
    onAuthenticated: () => void | Promise<void>;
    onError: (error: unknown) => void;
    disabled?: boolean;
    onLoadingChange?: (loading: boolean) => void;
}

/**
 * Mainland China mobile sign-in: an 11-digit number under +86, one SMS
 * code, and an account created on first verify. The number is sent to the
 * API in E.164 so GoTrue and the SMS provider agree on its shape.
 */
export function PhoneAuthForm({
    purpose,
    onAuthenticated,
    onError,
    disabled = false,
    onLoadingChange,
}: PhoneAuthFormProps) {
    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    const [sent, setSent] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [sending, setSending] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);

    const loading = sending || verifying;
    const busy = disabled || loading;

    useEffect(() => {
        if (onLoadingChange) onLoadingChange(loading);
    }, [loading, onLoadingChange]);

    useEffect(() => {
        if (seconds <= 0) return;
        timer.current = setInterval(() => {
            setSeconds((value) => Math.max(0, value - 1));
        }, 1000);
        return () => {
            if (timer.current) clearInterval(timer.current);
        };
    }, [seconds]);

    const send = async () => {
        if (phone.length !== PHONE_LENGTH || !phone.startsWith("1")) {
            setLocalError(uiText("请输入 11 位手机号。"));
            return;
        }
        setLocalError(null);
        setSending(true);
        try {
            await startPhoneSignIn(`+86${phone}`);
            setSent(true);
            setSeconds(RESEND_SECONDS);
        } catch (error) {
            onError(error);
        } finally {
            setSending(false);
        }
    };

    const verify = async (event: React.FormEvent) => {
        event.preventDefault();
        if (code.length !== 6) {
            setLocalError(uiText("请输入 6 位验证码。"));
            return;
        }
        setLocalError(null);
        setVerifying(true);
        try {
            await verifyPhoneSignIn(`+86${phone}`, code);
            await onAuthenticated();
        } catch (error) {
            onError(error);
        } finally {
            setVerifying(false);
        }
    };

    return (
        <form onSubmit={verify} className="space-y-4">
            <div>
                <FieldLabel htmlFor="phone">{uiText("手机号")}</FieldLabel>
                <div className="flex items-stretch gap-2">
                    <span className="inline-flex shrink-0 items-center rounded-xl border border-gray-200 bg-white/70 px-3 text-sm text-gray-600">
                        +86
                    </span>
                    <InputUI
                        id="phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        maxLength={PHONE_LENGTH}
                        value={phone}
                        onChange={(event) =>
                            setPhone(event.target.value.replace(/\D/g, ""))
                        }
                        placeholder={uiText("请输入手机号")}
                        className={`w-full ${authInputUIClassName}`}
                    />
                </div>
            </div>

            <div>
                <FieldLabel htmlFor="phone-code">{uiText("验证码")}</FieldLabel>
                <div className="flex items-stretch gap-2">
                    <InputUI
                        id="phone-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={code}
                        onChange={(event) =>
                            setCode(event.target.value.replace(/\D/g, ""))
                        }
                        placeholder={uiText("6 位数字")}
                        className={`w-full ${authInputUIClassName}`}
                    />
                    <PillButtonUI
                        type="button"
                        tone="white"
                        size="normal"
                        className="shrink-0"
                        disabled={busy || seconds > 0}
                        onClick={() => void send()}
                    >
                        {sending
                            ? uiText("发送中…")
                            : seconds > 0
                              ? `${seconds}s`
                              : sent
                                ? uiText("重新获取")
                                : uiText("获取验证码")}
                    </PillButtonUI>
                </div>
            </div>

            {localError && (
                <p role="alert" className="text-sm text-red-600">
                    {localError}
                </p>
            )}

            <p className="text-xs leading-relaxed text-gray-500">
                {purpose === "signup"
                    ? uiText("验证通过后将创建账户，并进入账户设置。")
                    : uiText("未注册的手机号验证后将自动创建账户。")}
            </p>

            <PillButtonUI
                type="submit"
                tone="black"
                size="normal"
                className="w-full"
                disabled={busy || code.length !== 6}
            >
                {verifying
                    ? uiText("验证中…")
                    : purpose === "signup"
                      ? uiText("验证并注册")
                      : uiText("验证并登录")}
            </PillButtonUI>
        </form>
    );
}
