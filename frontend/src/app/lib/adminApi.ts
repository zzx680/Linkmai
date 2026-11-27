export interface AdminInviteCode {
    id: string;
    label: string | null;
    active: boolean;
    max_uses: number;
    uses: number;
    expires_at: string | null;
    created_at: string;
    last_used_at: string | null;
    used: boolean;
}

export interface AdminContactMessage {
    id: string;
    name: string | null;
    email: string;
    subject: string | null;
    message: string;
    source: string;
    created_at: string;
    responded_at: string | null;
}

export class AdminApiError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`/api/admin${path}`, {
        ...init,
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!response.ok) {
        throw new AdminApiError(response.status, "Admin request failed");
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
}

export async function adminLogin(password: string): Promise<void> {
    await adminRequest<{ ok: true }>("/login", {
        method: "POST",
        body: JSON.stringify({ password }),
    });
}

export async function adminLogout(): Promise<void> {
    await adminRequest<{ ok: true }>("/logout", { method: "POST" });
}

export async function getAdminInviteCodes(): Promise<AdminInviteCode[]> {
    return (await adminRequest<{ codes: AdminInviteCode[] }>("/invite-codes")).codes;
}

export async function createAdminInviteCode(input: {
    label: string;
    maxUses: number;
    expiresAt: string | null;
    code?: string;
}): Promise<{ code: string; invite: AdminInviteCode }> {
    return adminRequest("/invite-codes", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export async function setAdminInviteCodeActive(id: string, active: boolean): Promise<void> {
    await adminRequest(`/invite-codes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
    });
}

export async function getAdminContactMessages(): Promise<AdminContactMessage[]> {
    return (await adminRequest<{ messages: AdminContactMessage[] }>("/contact-messages")).messages;
}

export async function setAdminMessageResponded(id: string, responded: boolean): Promise<void> {
    await adminRequest(`/contact-messages/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ responded }),
    });
}
