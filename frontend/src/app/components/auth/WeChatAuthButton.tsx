"use client";

import { uiText } from "@linkmai/client";
import { MessageCircle } from "lucide-react";
import { pillButtonUIClassName } from "@linkmai/ui";
import { wechatSignInUrl } from "@/app/lib/authApi";

interface WeChatAuthButtonProps {
    next: string;
    disabled?: boolean;
    label?: string;
}

/** An ordinary navigation: WeChat's QR page handles the rest. */
export function WeChatAuthButton({
    next,
    disabled = false,
    label,
}: WeChatAuthButtonProps) {
    if (disabled) {
        return (
            <span
                className={pillButtonUIClassName({
                    tone: "white",
                    size: "normal",
                    className:
                        "w-full cursor-not-allowed justify-center opacity-50",
                })}
                aria-disabled="true"
            >
                <MessageCircle className="size-4" aria-hidden="true" />
                {uiText("微信登录暂不可用")}
            </span>
        );
    }
    return (
        <a
            href={wechatSignInUrl(next)}
            className={pillButtonUIClassName({
                tone: "white",
                size: "normal",
                className: "w-full justify-center",
            })}
        >
            <MessageCircle className="size-4" aria-hidden="true" />
            {label ?? uiText("微信扫码登录")}
        </a>
    );
}
