import { createHash } from "node:crypto";

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Stable storage key for an invite code; the plaintext never enters the DB. */
export function hashInviteCode(code: string): string {
  return createHash("sha256").update(normalizeInviteCode(code)).digest("hex");
}
