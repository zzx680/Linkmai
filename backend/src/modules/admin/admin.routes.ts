import { Router, type NextFunction, type Request, type Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { asyncRoute } from "../../middleware/asyncRoute";
import { requireTrustedOrigin } from "../../middleware/trustedOrigin";
import { sendInternalError } from "../../lib/httpError";
import { createServerSupabase } from "../../lib/supabase";
import {
  adminAuthConfigured,
  createInviteCode,
  inviteCodeAdminSchema,
  listInviteCodes,
  listMessages,
  markMessage,
  setInviteCodeActive,
  verifyAdminPassword,
} from "./admin.service";

export const adminRouter = Router();

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function cookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Host-linkmai-admin"
    : "linkmai-admin";
}

function signature(expires: string): string {
  return createHmac("sha256", process.env.LINKMAI_ADMIN_SESSION_SECRET ?? "")
    .update(`v1.${expires}`)
    .digest("hex");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readCookie(req: Request, name: string): string | null {
  const header = req.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}

function setAdminSession(res: Response): void {
  const expires = String(Date.now() + SESSION_TTL_MS);
  res.cookie(cookieName(), `${expires}.${signature(expires)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

function clearAdminSession(res: Response): void {
  res.clearCookie(cookieName(), { path: "/" });
}

function hasAdminSession(req: Request): boolean {
  if (!adminAuthConfigured()) return false;
  const raw = readCookie(req, cookieName());
  if (!raw) return false;
  const [expires, given] = raw.split(".");
  if (!expires || !given || !/^\d+$/.test(expires)) return false;
  if (Number(expires) <= Date.now()) return false;
  return safeEqual(given, signature(expires));
}

adminRouter.use(requireTrustedOrigin);
adminRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

function unauthorized(res: Response) {
  res.status(401).json({ code: "admin_unauthorized" });
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!hasAdminSession(req)) return unauthorized(res);
  next();
}

adminRouter.post("/login", asyncRoute(async (req, res) => {
  if (!adminAuthConfigured()) {
    return res.status(503).json({ code: "admin_not_configured" });
  }
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!verifyAdminPassword(password)) {
    return res.status(401).json({ code: "invalid_admin_password" });
  }
  setAdminSession(res);
  res.json({ ok: true });
}));

adminRouter.post("/logout", (req, res) => {
  clearAdminSession(res);
  res.json({ ok: true });
});

adminRouter.get("/session", requireAdmin, (_req, res) => {
  res.json({ authenticated: true });
});

adminRouter.get("/invite-codes", requireAdmin, asyncRoute(async (_req, res) => {
  res.json({ codes: await listInviteCodes(createServerSupabase()) });
}));

adminRouter.post("/invite-codes", requireAdmin, asyncRoute(async (req, res) => {
  const parsed = inviteCodeAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ code: "invalid_invite_code_input" });
  }
  try {
    const result = await createInviteCode(createServerSupabase(), parsed.data);
    res.status(201).json(result);
  } catch (error) {
    sendInternalError(res, error, 500, { operation: "admin.invite_codes.create" });
  }
}));

adminRouter.patch("/invite-codes/:id", requireAdmin, asyncRoute(async (req, res) => {
  const active = req.body?.active;
  if (typeof active !== "boolean") {
    return res.status(400).json({ code: "invalid_invite_code_input" });
  }
  try {
    await setInviteCodeActive(createServerSupabase(), req.params.id, active);
    res.json({ ok: true });
  } catch (error) {
    sendInternalError(res, error, 500, { operation: "admin.invite_codes.update" });
  }
}));

adminRouter.get("/contact-messages", requireAdmin, asyncRoute(async (_req, res) => {
  res.json({ messages: await listMessages(createServerSupabase()) });
}));

adminRouter.patch("/contact-messages/:id", requireAdmin, asyncRoute(async (req, res) => {
  const responded = req.body?.responded;
  if (typeof responded !== "boolean") {
    return res.status(400).json({ code: "invalid_contact_message_input" });
  }
  try {
    await markMessage(createServerSupabase(), req.params.id, responded);
    res.json({ ok: true });
  } catch (error) {
    sendInternalError(res, error, 500, { operation: "admin.contact_messages.update" });
  }
}));
