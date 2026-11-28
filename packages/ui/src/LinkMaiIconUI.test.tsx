import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LinkMaiIcon } from "./LinkMaiIconUI";

function firstBladeFill(container: HTMLElement) {
    const gradient = container.querySelector(
        'linearGradient[id$="-m-glassFill"]',
    );
    const stop = gradient?.querySelector("stop");
    return (stop as SVGStopElement | null)?.style.stopColor.replace(/\s/g, "");
}

afterEach(() => {
    document.documentElement.classList.remove("dark");
});

describe("LinkMaiIcon", () => {
    it("renders the dark mark on the light theme", () => {
        const { container } = render(<LinkMaiIcon />);

        expect(firstBladeFill(container)).toBe("rgb(10,10,10)");
    });

    it("renders the white mark when the document is in dark mode", () => {
        document.documentElement.classList.add("dark");
        const { container } = render(<LinkMaiIcon />);

        expect(firstBladeFill(container)).toBe("rgb(255,255,255)");
    });

    it("swaps palettes when the theme class changes while mounted", async () => {
        const { container } = render(<LinkMaiIcon />);
        expect(firstBladeFill(container)).toBe("rgb(10,10,10)");

        document.documentElement.classList.add("dark");

        await waitFor(() =>
            expect(firstBladeFill(container)).toBe("rgb(255,255,255)"),
        );
    });

    it("colours a tinted mark in both themes, under the status palettes", () => {
        const { container, rerender } = render(<LinkMaiIcon tint="violet" />);
        expect(firstBladeFill(container)).toBe("rgb(139,92,246)");

        document.documentElement.classList.add("dark");
        rerender(<LinkMaiIcon tint="violet" />);
        expect(firstBladeFill(container)).toBe("rgb(139,92,246)");

        rerender(<LinkMaiIcon tint="violet" error />);
        expect(firstBladeFill(container)).toBe("rgb(248,113,113)");
    });

    it("keeps the status palettes in dark mode", () => {
        document.documentElement.classList.add("dark");
        const { container } = render(<LinkMaiIcon done />);

        expect(firstBladeFill(container)).toBe("rgb(74,222,128)");
    });
});
