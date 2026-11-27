import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeChatAuthButton } from "./WeChatAuthButton";

describe("WeChatAuthButton", () => {
    it("navigates through the backend so WeChat sets the cookie session", () => {
        render(<WeChatAuthButton next="/assistant" />);
        expect(screen.getByRole("link", { name: /微信扫码登录/ })).toHaveAttribute(
            "href",
            "/api/auth/wechat/start?next=%2Fassistant",
        );
    });
});
