import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setUiLocale } from "@mike/client";
import { LoginPage } from "../../../word-addin/src/taskpane/auth/LoginPage";

const { options } = vi.hoisted(() => ({ options: vi.fn() }));
vi.mock("../../../word-addin/src/taskpane/api/client", () => ({ getSignInOptions: options }));
vi.mock("../../../word-addin/src/taskpane/auth/useAuth", () => ({
    useAuth: () => ({ login: vi.fn(), loginWithGoogle: vi.fn(), loading: false, error: null }),
}));

beforeEach(() => { options.mockReset(); setUiLocale("zh-CN"); });
afterEach(() => setUiLocale("en"));

it("shows the Chinese email login while provider configuration is unknown or disabled", async () => {
    let finish!: (value: { google: boolean }) => void;
    options.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<LoginPage />);
    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "使用 Google 登录" })).toBeNull();
    await act(async () => finish({ google: false }));
    expect(screen.queryByRole("button", { name: "使用 Google 登录" })).toBeNull();
});

it("offers Google only when this deployment confirms it is enabled", async () => {
    options.mockResolvedValue({ google: true });
    render(<LoginPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "使用 Google 登录" })).toBeVisible());
});

it("keeps email login usable when provider lookup fails", async () => {
    options.mockRejectedValue(new Error("offline"));
    render(<LoginPage />);
    await waitFor(() => expect(options).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "登录" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "使用 Google 登录" })).toBeNull();
});
