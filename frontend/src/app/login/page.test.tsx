import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";
import { AuthApiError } from "@/app/lib/authApi";

const {
    signInWithInviteCode,
    refreshSession,
    push,
    replace,
    signInOptions,
} = vi.hoisted(() => ({
    signInWithInviteCode: vi.fn(),
    refreshSession: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    signInOptions: {
        value: {
            options: {
                google: false,
                sso: false,
                phone: false,
                wechat: false,
                invite: true,
                setupRequired: false,
                signup: false,
            },
            loaded: true,
            providersKnown: true,
        },
    },
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, replace }),
}));

vi.mock("@/app/lib/authApi", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/app/lib/authApi")>()),
    signInWithInviteCode,
}));

vi.mock("@/app/contexts/AuthContext", () => ({
    useAuth: () => ({
        isAuthenticated: false,
        authLoading: false,
        refreshSession,
    }),
}));

vi.mock("@/app/hooks/useSignInOptions", () => ({
    useSignInOptions: () => signInOptions.value,
}));

vi.mock("@/app/components/site-logo", () => ({
    SiteLogo: () => <div>LinkMai</div>,
}));

const inviteOnly = {
    options: {
        google: false,
        sso: false,
        phone: false,
        wechat: false,
        invite: true,
        setupRequired: false,
        signup: false,
    },
    loaded: true,
    providersKnown: true,
};

const phoneAndWeChat = {
    options: {
        google: false,
        sso: false,
        phone: true,
        wechat: true,
        invite: true,
        setupRequired: false,
        signup: false,
    },
    loaded: true,
    providersKnown: true,
};

describe("LoginPage", () => {
    beforeEach(() => {
        signInWithInviteCode.mockReset();
        refreshSession.mockReset();
        push.mockReset();
        replace.mockReset();
        signInOptions.value = inviteOnly;
    });

    it("offers the phone form and WeChat when the deployment configures both", () => {
        signInOptions.value = phoneAndWeChat;
        render(<LoginPage />);

        expect(screen.getByLabelText("手机号")).toBeVisible();
        expect(screen.getByLabelText("验证码")).toBeVisible();
        const wechat = screen.getByRole("link", { name: /微信扫码登录/ });
        expect(wechat).toHaveAttribute(
            "href",
            "/api/auth/wechat/start?next=%2Fonboarding%2Fprofile",
        );
        // The invite route stays reachable, but behind a link rather than a form.
        expect(screen.queryByPlaceholderText("请输入邀请码")).not.toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "有邀请码？用邀请码进入" }),
        ).toBeVisible();
        expect(screen.queryByLabelText("邮箱")).not.toBeInTheDocument();
    });

    it("reveals the invite form on request when providers are configured", async () => {
        signInOptions.value = phoneAndWeChat;
        render(<LoginPage />);

        await userEvent.click(
            screen.getByRole("button", { name: "有邀请码？用邀请码进入" }),
        );
        expect(screen.getByPlaceholderText("请输入邀请码")).toBeVisible();
    });

    it("falls back to the invite form and says the providers are not open yet", () => {
        render(<LoginPage />);

        expect(screen.getByLabelText("邀请码")).toBeVisible();
        expect(screen.getByText("手机号与微信登录即将开放。")).toBeVisible();
        expect(screen.queryByText("微信扫码登录")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("手机号")).not.toBeInTheDocument();
    });

    it("signs in with an invite code", async () => {
        signInWithInviteCode.mockResolvedValue({ user: { id: "u1" } });
        refreshSession.mockResolvedValue(undefined);
        render(<LoginPage />);

        await userEvent.type(screen.getByPlaceholderText("请输入邀请码"), "LINKMAI-BETA");
        await userEvent.click(screen.getByRole("button", { name: /进入灵迈/ }));

        expect(signInWithInviteCode).toHaveBeenCalledWith("LINKMAI-BETA");
        expect(refreshSession).toHaveBeenCalled();
        expect(push).toHaveBeenCalledWith("/onboarding/profile");
    });

    it("reports an invalid invite code without navigating", async () => {
        signInWithInviteCode.mockRejectedValue(
            new AuthApiError(401, "invalid_invite_code", "invalid"),
        );
        render(<LoginPage />);

        await userEvent.type(screen.getByPlaceholderText("请输入邀请码"), "WRONG-CODE");
        await userEvent.click(screen.getByRole("button", { name: /进入灵迈/ }));

        expect(await screen.findByRole("alert")).toHaveTextContent("邀请码无效");
        expect(push).not.toHaveBeenCalled();
    });
});
