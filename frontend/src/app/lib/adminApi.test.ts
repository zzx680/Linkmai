import { afterEach, describe, expect, it, vi } from "vitest";
import {
    AdminApiError,
    adminLogin,
    adminLogout,
    createAdminInviteCode,
    getAdminContactMessages,
    getAdminInviteCodes,
    setAdminInviteCodeActive,
    setAdminMessageResponded,
} from "./adminApi";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
    return { ok: status < 400, status, json: async () => body } as Response;
}

function emptyResponse(status: number) {
    return { ok: status < 400, status } as Response;
}

afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
});

function useFetch() {
    vi.stubGlobal("fetch", fetchMock);
}

describe("admin API", () => {
    it("logs in with the admin password and keeps the session cookie", async () => {
        useFetch();
        fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
        await adminLogin("secret");
        expect(fetchMock).toHaveBeenCalledWith("/api/admin/login", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: "secret" }),
        });
    });

    it("logs out without reading a body", async () => {
        useFetch();
        fetchMock.mockResolvedValue(emptyResponse(204));
        await expect(adminLogout()).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/logout",
            expect.objectContaining({ method: "POST" }),
        );
    });

    it("unwraps invite codes", async () => {
        useFetch();
        const codes = [{ id: "one", code: "123456" }];
        fetchMock.mockResolvedValue(jsonResponse({ codes }));
        await expect(getAdminInviteCodes()).resolves.toEqual(codes);
    });

    it("creates an invite code with the supplied label and uses", async () => {
        useFetch();
        const payload = { code: "654321", invite: { id: "two" } };
        fetchMock.mockResolvedValue(jsonResponse(payload));
        await expect(
            createAdminInviteCode({ label: "内测", maxUses: 5 }),
        ).resolves.toEqual(payload);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/invite-codes",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ label: "内测", maxUses: 5 }),
            }),
        );
    });

    it("encodes the invite id when toggling it", async () => {
        useFetch();
        fetchMock.mockResolvedValue(emptyResponse(204));
        await setAdminInviteCodeActive("a/b", false);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/invite-codes/a%2Fb",
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({ active: false }),
            }),
        );
    });

    it("unwraps contact messages", async () => {
        useFetch();
        const messages = [{ id: "m1", email: "a@b.test" }];
        fetchMock.mockResolvedValue(jsonResponse({ messages }));
        await expect(getAdminContactMessages()).resolves.toEqual(messages);
    });

    it("encodes the message id when marking it responded", async () => {
        useFetch();
        fetchMock.mockResolvedValue(emptyResponse(204));
        await setAdminMessageResponded("m/1", true);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/contact-messages/m%2F1",
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({ responded: true }),
            }),
        );
    });

    it("surfaces the status when the console rejects the call", async () => {
        useFetch();
        fetchMock.mockResolvedValue(emptyResponse(403));
        const failure = await adminLogin("wrong").catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(AdminApiError);
        expect(failure).toMatchObject({ status: 403, message: "Admin request failed" });
    });
});
