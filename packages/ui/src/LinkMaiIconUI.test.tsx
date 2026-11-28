import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LinkMaiIcon } from "./LinkMaiIconUI";

function markStroke(container: HTMLElement) {
    return container.querySelector("path")?.getAttribute("stroke");
}

afterEach(() => {
    document.documentElement.classList.remove("dark");
});

describe("LinkMaiIcon", () => {
    it("renders the mark black on the light theme", () => {
        const { container } = render(<LinkMaiIcon />);

        expect(markStroke(container)).toBe("#0a0a0a");
    });

    it("renders the mark white when the document is in dark mode", () => {
        document.documentElement.classList.add("dark");
        const { container } = render(<LinkMaiIcon />);

        expect(markStroke(container)).toBe("#ffffff");
    });

    it("swaps colours when the theme class changes while mounted", async () => {
        const { container } = render(<LinkMaiIcon />);
        expect(markStroke(container)).toBe("#0a0a0a");

        document.documentElement.classList.add("dark");

        await waitFor(() => expect(markStroke(container)).toBe("#ffffff"));
    });

    it("colours a tinted mark in both themes, under the status palettes", () => {
        const { container, rerender } = render(<LinkMaiIcon tint="violet" />);
        expect(markStroke(container)).toBe("#8b5cf6");

        document.documentElement.classList.add("dark");
        rerender(<LinkMaiIcon tint="violet" />);
        expect(markStroke(container)).toBe("#8b5cf6");

        rerender(<LinkMaiIcon tint="violet" error />);
        expect(markStroke(container)).toBe("#ef4444");
    });

    it("keeps the status colours in dark mode", () => {
        document.documentElement.classList.add("dark");
        const { container } = render(<LinkMaiIcon done />);

        expect(markStroke(container)).toBe("#22c55e");
    });

    it("sizes the mark in square pixels", () => {
        const { container } = render(<LinkMaiIcon size={14} />);
        const svg = container.querySelector("svg");

        expect(svg?.getAttribute("width")).toBe("14");
        expect(svg?.getAttribute("height")).toBe("14");
    });
});
