import { z } from "zod";
import type { Db } from "../../lib/supabase";

export const contactInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().max(200).optional().default(""),
  message: z.string().trim().min(1).max(5000),
  website: z.string().optional(),
});

export type ContactInput = z.infer<typeof contactInputSchema>;

export interface ContactMessage {
  id: string;
  name: string | null;
  email: string;
  subject: string | null;
  message: string;
  source: string;
  created_at: string;
  responded_at: string | null;
}

export async function createContactMessage(
  db: Db,
  input: ContactInput,
  metadata: { userAgent: string | null; ipHash: string | null },
): Promise<void> {
  const { error } = await db.from("contact_messages").insert({
    name: input.name,
    email: input.email,
    subject: input.subject || null,
    message: input.message,
    source: "landing",
    user_agent: metadata.userAgent,
    ip_hash: metadata.ipHash,
  });
  if (error) throw new Error("Unable to store contact message", { cause: error });
}

export async function listContactMessages(
  db: Db,
  limit = 200,
): Promise<ContactMessage[]> {
  const { data, error } = await db
    .from("contact_messages")
    .select("id,name,email,subject,message,source,created_at,responded_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("Unable to list contact messages", { cause: error });
  return (data ?? []) as ContactMessage[];
}

export async function setContactMessageResponded(
  db: Db,
  id: string,
  responded: boolean,
): Promise<void> {
  const { error } = await db
    .from("contact_messages")
    .update({ responded_at: responded ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error("Unable to update contact message", { cause: error });
}
