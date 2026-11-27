import { describe, expect, it } from "vitest";
import {
  inviteCodeSchema,
  inviteLoginEnabled,
  isValidInviteCode,
  normalizeInviteCode,
} from "../auth.invite";

describe("invite sign-in", () => {
  it("is enabled only when at least one non-empty code is configured", () => {
    expect(inviteLoginEnabled({})).toBe(false);
    expect(inviteLoginEnabled({ LINKMAI_INVITE_CODES: " , " })).toBe(false);
    expect(inviteLoginEnabled({ LINKMAI_INVITE_CODES: "LM-BETA, LM-TEAM" })).toBe(true);
  });

  it("matches codes case-insensitively and ignores surrounding spaces", () => {
    const env = { LINKMAI_INVITE_CODES: "lm-beta, LM-TEAM" };
    expect(normalizeInviteCode("  lm-beta ")).toBe("LM-BETA");
    expect(isValidInviteCode("LM-BETA", env)).toBe(true);
    expect(isValidInviteCode("lm-team", env)).toBe(true);
    expect(isValidInviteCode("LM-OTHER", env)).toBe(false);
  });

  it("rejects codes that are too short or missing", () => {
    expect(inviteCodeSchema.safeParse({ code: "short" }).success).toBe(false);
    expect(inviteCodeSchema.safeParse({ code: "LM-BETA" }).success).toBe(true);
  });
});
