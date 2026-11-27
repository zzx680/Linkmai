import { Router } from "express";
import { createHash } from "node:crypto";
import { asyncRoute } from "../../middleware/asyncRoute";
import { createServerSupabase } from "../../lib/supabase";
import { sendInternalError } from "../../lib/httpError";
import { contactInputSchema, createContactMessage } from "./contact.service";

export const contactRouter = Router();

contactRouter.post("/", asyncRoute(async (req, res) => {
  const parsed = contactInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ code: "invalid_contact_message" });
  }
  // Honeypot: a real person never fills this hidden field.
  if (parsed.data.website) return res.status(204).end();

  const ip = req.ip ?? "";
  const ipHash = ip
    ? createHash("sha256").update(ip).digest("hex").slice(0, 32)
    : null;
  try {
    await createContactMessage(createServerSupabase(), parsed.data, {
      userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
      ipHash,
    });
    res.status(201).json({ ok: true });
  } catch (error) {
    sendInternalError(res, error, 500, { operation: "contact.submit" });
  }
}));
