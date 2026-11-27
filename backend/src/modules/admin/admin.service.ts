import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Db } from "../../lib/supabase";
import { hashInviteCode } from "../../lib/inviteCode";
import {
  listContactMessages,
  setContactMessageResponded,
  type ContactMessage,
} from "../contact/contact.service";

export const inviteCodeAdminSchema = z.object({
  label: z.string().trim().max(120).optional().default(""),
  maxUses: z.number().int().min(1).max(1000).optional().default(1),
  expiresAt: z.string().datetime().nullable().optional(),
  code: z.string().trim().min(6).max(128).optional(),
});

export interface AdminInviteCode {
  id: string;
  label: string | null;
  active: boolean;
  max_uses: number;
  uses: number;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
}

function adminPassword(): string {
  return process.env.LINKMAI_ADMIN_PASSWORD ?? "";
}

function sessionSecret(): string {
  return process.env.LINKMAI_ADMIN_SESSION_SECRET ?? "";
}

export function adminAuthConfigured(): boolean {
  return Boolean(adminPassword() && sessionSecret());
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyAdminPassword(password: string): boolean {
  if (!adminAuthConfigured()) return false;
  return safeEqual(password, adminPassword());
}

export async function listInviteCodes(db: Db): Promise<AdminInviteCode[]> {
  const { data, error } = await db
    .from("invite_codes")
    .select("id,label,active,max_uses,uses,expires_at,created_at,last_used_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("Unable to list invite codes", { cause: error });
  return (data ?? []) as AdminInviteCode[];
}

export async function createInviteCode(
  db: Db,
  input: z.infer<typeof inviteCodeAdminSchema>,
): Promise<{ code: string; invite: AdminInviteCode }> {
  const code = (input.code?.trim() || `LM-${randomBytes(6).toString("hex").toUpperCase()}`).toUpperCase();
  const { data, error } = await db
    .from("invite_codes")
    .insert({
      code_hash: hashInviteCode(code),
      label: input.label || null,
      max_uses: input.maxUses,
      expires_at: input.expiresAt ?? null,
    })
    .select("id,label,active,max_uses,uses,expires_at,created_at,last_used_at")
    .single();
  if (error) throw new Error("Unable to create invite code", { cause: error });
  return { code, invite: data as AdminInviteCode };
}

export async function setInviteCodeActive(
  db: Db,
  id: string,
  active: boolean,
): Promise<void> {
  const { error } = await db.from("invite_codes").update({ active }).eq("id", id);
  if (error) throw new Error("Unable to update invite code", { cause: error });
}

export async function listMessages(db: Db): Promise<ContactMessage[]> {
  return listContactMessages(db);
}

export async function markMessage(
  db: Db,
  id: string,
  responded: boolean,
): Promise<void> {
  await setContactMessageResponded(db, id, responded);
}
