import { afterEach, describe, expect, it, vi } from "vitest";
import { submitContactMessage } from "./contactApi";

const fetchMock = vi.fn();

afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
});

describe("contact form", () => {
    it("posts the message without a session", async () => {
        vi.stubGlobal("fetch", fetchMock);
        fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);
        await expect(
            submitContactMessage({
                name: "陈律师",
                email: "chen@example.test",
                subject: "合作",
                message: "想了解部署方式",
            }),
        ).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledWith("/api/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "陈律师",
                email: "chen@example.test",
                subject: "合作",
                message: "想了解部署方式",
            }),
        });
    });

    it("reports a rejected submission without leaking the response", async () => {
        vi.stubGlobal("fetch", fetchMock);
        fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);
        await expect(
            submitContactMessage({ name: "", email: "a@b.test", message: "hi" }),
        ).rejects.toThrow("Contact message could not be sent");
    });
});
