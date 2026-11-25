import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it("shows the configured deployment mailbox without submitting to a missing API", async () => {
    vi.stubEnv("NEXT_PUBLIC_LINKMAI_SUPPORT_EMAIL", "support@example.test");
    const { default: SupportPage } = await import("./page");
    const { container } = render(<SupportPage />);
    expect(screen.getByRole("link", { name: "support@example.test" })).toHaveAttribute("href", "mailto:support@example.test");
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).not.toContain("mikeoss.com");
});

it("directs users to the administrator when the mailbox is unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_LINKMAI_SUPPORT_EMAIL", "");
    const { default: SupportPage } = await import("./page");
    render(<SupportPage />);
    expect(screen.getByText(/尚未配置支持邮箱/)).toBeInTheDocument();
});
