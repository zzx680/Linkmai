import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";
import { AuthApiError } from "@/app/lib/authApi";

const { signInWithInviteCode, refreshSession, push, replace } = vi.hoisted(() => ({
    signInWithInviteCode: vi.fn(),
    refreshSession: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
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

vi.mock("@/app/components/site-logo", () => ({
    SiteLogo: () => <div>LinkMai</div>,
}));

describe("LoginPage", () => {
    beforeEach(() => {
        signInWithInviteCode.mockReset();
        refreshSession.mockReset();
        push.mockReset();
        replace.mockReset();
    });

    it("only shows the invite code form and signs in", async () => {
        signInWithInviteCode.mockResolvedValue({ user: { id: "u1" } });
        refreshSession.mockResolvedValue(undefined);
        render(<LoginPage />);

        expect(screen.getByLabelText("邀请码")).toBeVisible();
        expect(screen.queryByText("微信扫码登录")).not.toBeInTheDocument();
        expect(screen.queryByText("手机号登录")).not.toBeInTheDocument();
        expect(screen.queryByText("即将开放")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("邮箱")).not.toBeInTheDocument();

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
