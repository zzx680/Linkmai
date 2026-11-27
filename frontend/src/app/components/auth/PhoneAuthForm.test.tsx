import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PhoneAuthForm } from "./PhoneAuthForm";
import { startPhoneSignIn, verifyPhoneSignIn } from "@/app/lib/authApi";

vi.mock("@/app/lib/authApi", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/app/lib/authApi")>()),
    startPhoneSignIn: vi.fn(),
    verifyPhoneSignIn: vi.fn(),
}));

describe("PhoneAuthForm", () => {
    it("sends an E.164 number and verifies the code", async () => {
        vi.mocked(startPhoneSignIn).mockResolvedValue(undefined);
        vi.mocked(verifyPhoneSignIn).mockResolvedValue({
            user: { id: "u1", email: "", pendingEmail: null, createdWithGoogle: false },
        });
        const onAuthenticated = vi.fn();
        render(
            <PhoneAuthForm
                purpose="login"
                onAuthenticated={onAuthenticated}
                onError={vi.fn()}
            />,
        );

        const user = userEvent.setup();
        await user.type(screen.getByLabelText("手机号"), "13800138000");
        await user.click(screen.getByRole("button", { name: "获取验证码" }));
        await waitFor(() =>
            expect(startPhoneSignIn).toHaveBeenCalledWith("+8613800138000"),
        );

        await user.type(screen.getByLabelText("验证码"), "123456");
        await user.click(screen.getByRole("button", { name: "验证并登录" }));
        await waitFor(() =>
            expect(verifyPhoneSignIn).toHaveBeenCalledWith(
                "+8613800138000",
                "123456",
            ),
        );
        expect(onAuthenticated).toHaveBeenCalled();
    });
});
