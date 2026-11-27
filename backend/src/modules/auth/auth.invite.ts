// Invite-code sign-in for the closed beta.
//
// The code is the credential. Each configured code maps to one stable
// synthetic Supabase user, so the same code returns to the same workspace.
// Codes are read from LINKMAI_INVITE_CODES (comma separated) and never leave
// the server; the browser only sees whether an invite route is available.

import { createHash, timingSafeEqual } from "node:crypto";
import { hashInviteCode, normalizeInviteCode } from "../../lib/inviteCode";

export { hashInviteCode, normalizeInviteCode };
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import type { Db } from "../../lib/supabase";

export const inviteCodeSchema = z.object({
  code: z.string().trim().min(6).max(128),
});

function configuredCodes(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.LINKMAI_INVITE_CODES ?? "")
    .split(",")
    .map((code) => normalizeInviteCode(code))
    .filter(Boolean);
}

export function inviteLoginEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return configuredCodes(env).length > 0;
}


function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}


export interface InviteAuthorization {
  label: string | null;
  source: "database" | "environment";
}

function environmentAuthorization(code: string): InviteAuthorization | null {
  return isValidInviteCode(code)
    ? { label: "环境变量邀请码", source: "environment" }
    : null;
}

/**
 * Validate an invite code against the admin-managed table, then fall back to
 * LINKMAI_INVITE_CODES for a fresh deployment before the first admin code is
 * created. A successful database use consumes one seat atomically enough for
 * a closed beta: the conditional update refuses a stale seat count.
 */
export async function authorizeInviteCode(
  db: Db,
  code: string,
): Promise<InviteAuthorization | null> {
  const normalized = normalizeInviteCode(code);
  const { data, error } = await db
    .from("invite_codes")
    .select("id,label,active,max_uses,uses,expires_at")
    .eq("code_hash", hashInviteCode(normalized))
    .maybeSingle();
  if (error) {
    // A deployment that has not applied the migration yet can still use the
    // environment fallback; every other database failure must stay visible.
    if ((error as { code?: string }).code === "42P01") {
      return environmentAuthorization(normalized);
    }
    throw new Error("Unable to read invite codes", { cause: error });
  }
  if (!data) {
    // The environment list is only a first-boot fallback. Once an admin has
    // created a database code, it must be the single source of truth.
    const { count, error: countError } = await db
      .from("invite_codes")
      .select("id", { count: "exact", head: true });
    if (countError) {
      throw new Error("Unable to count invite codes", { cause: countError });
    }
    return (count ?? 0) === 0 ? environmentAuthorization(normalized) : null;
  }
  if (!data.active) return null;
  if (data.uses >= data.max_uses) return null;
  if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) return null;
  const { error: consumeError } = await db
    .from("invite_codes")
    .update({ uses: data.uses + 1, last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .eq("uses", data.uses);
  if (consumeError) {
    throw new Error("Unable to consume invite code", { cause: consumeError });
  }
  return { label: data.label ?? null, source: "database" };
}

/** Constant-time check across every configured code. */
export function isValidInviteCode(
  code: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const given = digest(normalizeInviteCode(code));
  let valid = false;
  for (const candidate of configuredCodes(env)) {
    if (timingSafeEqual(given, digest(candidate))) valid = true;
  }
  return valid;
}

function inviteEmail(code: string): string {
  return `invite-${hashInviteCode(code).slice(0, 20)}@users.linkmai.com`;
}

async function magicLinkToken(db: Db, email: string): Promise<string> {
  const { data, error } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const token = data?.properties?.hashed_token;
  if (error || !token) {
    throw new Error("Unable to mint an invite session", { cause: error });
  }
  return token;
}

/**
 * Find or create the user for an invite code, then establish the request's
 * cookie session. The synthetic email is internal and never a contact value.
 */
export async function signInWithInviteCode(
  db: Db,
  client: SupabaseClient,
  code: string,
  label: string | null = null,
): Promise<User> {
  const email = inviteEmail(code);
  let token: string;
  try {
    token = await magicLinkToken(db, email);
  } catch {
    const { error } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        invite_login: true,
        invite_code_hash: hashInviteCode(code),
        invite_code_label: label,
        display_name: "灵迈内测用户",
      },
    });
    if (error && !/already|exists|registered/i.test(error.message)) {
      throw new Error("Unable to create the invite user", { cause: error });
    }
    token = await magicLinkToken(db, email);
  }

  const { data, error } = await client.auth.verifyOtp({
    token_hash: token,
    type: "magiclink",
  });
  if (error || !data.user || !data.session) {
    throw new Error("Unable to complete invite sign-in", { cause: error });
  }
  return data.user;
}
