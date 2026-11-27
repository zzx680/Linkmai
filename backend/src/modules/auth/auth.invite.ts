// Invite-code sign-in for the closed beta.
//
// The code is the credential. Each configured code maps to one stable
// synthetic Supabase user, so the same code returns to the same workspace.
// Codes are read from LINKMAI_INVITE_CODES (comma separated) and never leave
// the server; the browser only sees whether an invite route is available.

import { createHash, timingSafeEqual } from "node:crypto";
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

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
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
  const hash = createHash("sha256")
    .update(normalizeInviteCode(code))
    .digest("hex")
    .slice(0, 20);
  return `invite-${hash}@users.linkmai.com`;
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
        invite_code_hash: createHash("sha256")
          .update(normalizeInviteCode(code))
          .digest("hex"),
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
