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

describe("LoginPage", () => {
    beforeEach(() => {
        signInWithInviteCode.mockReset();
        refreshSession.mockReset();
        push.mockReset();
        replace.mockReset();
    });

    it("asks for an invite code and nothing else", () => {
        render(<LoginPage />);

        expect(screen.getByLabelText("邀请码")).toBeVisible();
        expect(screen.getByPlaceholderText("请输入邀请码")).toBeVisible();
        expect(screen.getByRole("button", { name: /进入灵迈/ })).toBeVisible();
        expect(screen.queryByLabelText("手机号")).not.toBeInTheDocument();
        expect(screen.queryByText(/微信/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText("邮箱")).not.toBeInTheDocument();
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

    it("asks for a code before calling the server", async () => {
        render(<LoginPage />);

        await userEvent.click(screen.getByRole("button", { name: /进入灵迈/ }));

        expect(await screen.findByRole("alert")).toHaveTextContent("请输入邀请码");
        expect(signInWithInviteCode).not.toHaveBeenCalled();
    });
});
