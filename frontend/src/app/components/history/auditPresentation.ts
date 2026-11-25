
import { uiText } from "@mike/client";
import type { AuditEvent, OrgPrivateContentKind } from "@/app/lib/mikeApi";

export interface AuditPrivateAccess {
  kind: OrgPrivateContentKind;
  item_id: string;
  has_access: boolean;
}

/** Only organization audit responses contain this server-derived descriptor. */
export function auditPrivateAccess(
  event: AuditEvent,
): AuditPrivateAccess | null {
  const value = event.detail?.private_content_access;
  if (!event.org_id || !value || typeof value !== "object") return null;
  const access = value as Record<string, unknown>;
  if (
    !["project", "workflow", "chat", "tabular_review", "document"].includes(
      String(access.kind),
    ) ||
    typeof access.item_id !== "string" ||
    !access.item_id ||
    typeof access.has_access !== "boolean"
  )
    return null;
  return access as unknown as AuditPrivateAccess;
}

export const ACTION_LABELS: Record<string, string> = {
  "org.private_content.permission_changed":
    uiText("Private content permission changed"),
  "org.private_content.opened": uiText("Private content accessed"),
  "org.private_content.closed": uiText("Private content access ended"),
  "org.api_key.saved": uiText("Provider key saved"),
  "org.api_key.removed": uiText("Provider key removed"),
  "org.api_key.enabled": uiText("Provider key enabled"),
  "org.api_key.disabled": uiText("Provider key disabled"),
  "org.personal_api_keys.allowed": uiText("Personal keys allowed"),
  "org.personal_api_keys.blocked": uiText("Personal keys blocked"),
  "org.member_exports.allowed": uiText("Member exports allowed"),
  "org.member_exports.blocked": uiText("Member exports turned off"),
  "org.member_deletes.allowed": uiText("Member data deletion allowed"),
  "org.member_deletes.blocked": uiText("Member data deletion turned off"),
  "org.created": uiText("Organization created"),
  "org.deleted": uiText("Organization deleted"),
  "org.restored": uiText("Organization restored"),
  "org.purged": uiText("Organization permanently deleted"),
  "org.invite.created": uiText("Invitation sent"),
  "org.invite.accepted": uiText("Invitation accepted"),
  "org.invite.declined": uiText("Invitation declined"),
  "org.invite.cancelled": uiText("Invitation cancelled"),
  "org.invite.resent": uiText("Invitation resent"),
  "org.member.role_changed": uiText("Member role changed"),
  "org.logo.updated": uiText("Logo updated"),
  "org.logo.removed": uiText("Logo removed"),
  "org.router_models.updated": uiText("Models updated"),
  "org.departure.item.transferred": uiText("Departed work transferred"),
  "org.departure.item.archived": uiText("Departed work archived"),
  "org.departure.item.recovered": uiText("Departed work recovered"),
  "org.departure.item.deleted": uiText("Departed work deleted"),
  "org.departure.item.expired": uiText("Departed work expired"),
  "org.departure.member.departed": uiText("Member departed"),
  "org.member.removed": uiText("Member removed"),
  "org.member.left": uiText("Member left"),
  "org.data.deleted": uiText("Organization data deleted"),
  "chat.message": uiText("Chat message sent"),
  "document.uploaded": uiText("Document uploaded"),
  "document.generated": uiText("Document generated"),
  "document.edited": uiText("Document edited"),
  "workflow.applied": uiText("Workflow applied"),
  "tabular.created": uiText("Review created"),
  "tabular.generated": uiText("Review run completed"),
  "playbook.created": uiText("Playbook created"),
  "playbook.imported": uiText("Playbook imported"),
  "playbook.replaced": uiText("Playbook replaced"),
  "playbook.deleted": uiText("Playbook deleted"),
  "playbook.run": uiText("Playbook review run"),
  "playbook.run.deleted": uiText("Playbook run deleted"),
  "export.chats": uiText("Chats exported"),
  "export.account": uiText("Account data exported"),
  "export.tabular": uiText("Review exported"),
  "export.memory": uiText("Memory exported"),
};

export const SURFACE_LABELS: Record<string, string> = {
  assistant: uiText("Assistant"),
  project: uiText("Project"),
  word: "Word",
  tabular: uiText("Tabular"),
  playbooks: uiText("Playbooks"),
  workflows: uiText("Workflows"),
  account: uiText("Account"),
  organization: uiText("Organization"),
};

export function auditLabel(value: string): string {
  return value
    .replace(/[_.]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function auditAction(event: AuditEvent): string {
  const label = ACTION_LABELS[event.action] ?? auditLabel(event.action);
  // Failed or cancelled operations must not read as successful changes.
  if (event.status === "completed") return label;
  const operations: Record<string, string> = {
    "chat.message": "Chat message",
    "document.uploaded": "Document upload",
    "document.generated": "Document generation",
    "document.edited": "Document edit",
    "workflow.applied": "Workflow application",
    "tabular.created": "Review creation",
    "tabular.generated": "Review run",
    "playbook.created": "Playbook creation",
    "playbook.imported": "Playbook import",
    "playbook.replaced": "Playbook replacement",
    "playbook.deleted": "Playbook deletion",
    "playbook.run": "Playbook review",
    "playbook.run.deleted": "Playbook run deletion",
    "export.chats": "Chat export",
    "export.account": "Account export",
    "export.tabular": "Review export",
    "export.memory": "Memory export",
  };
  return operations[event.action] ?? label;
}

function detailText(event: AuditEvent, key: string): string | null {
  const value = event.detail?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function auditActor(event: AuditEvent): string {
  return (
    event.user_display_name ||
    event.user_email ||
    (event.action === "org.purged" ||
    event.action === "org.departure.item.expired"
      ? "System"
      : "Unknown user")
  );
}

export function auditSubject(event: AuditEvent) {
  const action = event.action;
  let type = "Item";
  if (action.startsWith("org.invite.")) type = "Recipient";
  else if (action === "org.private_content.permission_changed") type = "Member";
  else if (action.startsWith("org.private_content."))
    type = auditLabel(detailText(event, "kind") ?? "item");
  else if (
    action.startsWith("org.member.") ||
    action === "org.departure.member.departed"
  )
    type = "Member";
  else if (
    action.startsWith("org.api_key.") ||
    action === "org.router_models.updated"
  )
    type = "Provider";
  else if (action.startsWith("org.departure.item."))
    type = auditLabel(detailText(event, "kind") ?? "item");
  else if (action.startsWith("org.")) type = "Organization";
  else if (action.startsWith("document.")) type = "Document";
  else if (action.startsWith("chat.")) type = "Chat";
  else if (action.startsWith("workflow.")) type = "Workflow";
  else if (action.startsWith("tabular.") || action === "export.tabular")
    type = "Review";
  else if (action.startsWith("playbook.run")) type = "Playbook run";
  else if (action.startsWith("playbook.")) type = "Playbook";
  else if (action === "export.chats") type = "Chats";
  else if (action === "export.account") type = "Account";
  else if (action === "export.memory") type = "Memory";

  const title = event.title?.trim();
  // Some older member events stored a UUID in title. Keep identifiers in
  // technical details, not where a person's name or email is expected.
  const isId =
    title && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(title);
  const recordedName =
    title && !isId
      ? title
      : (detailText(event, "target_email") ??
        (type === "Provider" ? detailText(event, "provider") : null));
  const name = ["Member", "Recipient"].includes(type)
    ? event.affected_user_display_name?.trim() || recordedName
    : recordedName;
  const context = [
    detailText(event, "organization_name") ?? detailText(event, "org_name"),
    detailText(event, "project_name"),
  ].filter((value): value is string => Boolean(value));
  if (!context.length && event.surface)
    context.push(SURFACE_LABELS[event.surface] ?? auditLabel(event.surface));
  return {
    type,
    name: name ?? "-",
    context: [...new Set(context)].join(" · "),
  };
}

/** Retain the recorded email for identity tooltips and stable monogram colors. */
export function auditSubjectEmail(event: AuditEvent): string | null {
  if (!["Member", "Recipient"].includes(auditSubject(event).type)) return null;
  const email = (detailText(event, "target_email") ?? event.title)?.trim();
  return email && /^[^\s@]+@[^\s@]+$/.test(email) ? email : null;
}

export function auditTimestamp(value: string, exact = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(exact ? ({ second: "2-digit", timeZoneName: "short" } as const) : {}),
  });
}

export type AuditDetailField = { label: string; value: string };

export function auditDetailFields(event: AuditEvent): AuditDetailField[] {
  const fields: AuditDetailField[] = [];
  const detail = event.detail ?? {};
  const add = (label: string, value: unknown) => {
    if (typeof value === "string" && value.trim())
      fields.push({ label, value });
    else if (typeof value === "number" && Number.isFinite(value))
      fields.push({ label, value: String(value) });
    else if (typeof value === "boolean")
      fields.push({ label, value: value ? "Yes" : "No" });
  };
  const role = detailText(event, "role");
  const previous = detailText(event, "previous_role");
  if (event.action === "org.member.role_changed") {
    if (previous && role)
      add(
        event.status === "completed" ? "Role" : "Requested role change",
        `${auditLabel(previous)} → ${auditLabel(role)}`,
      );
    else if (role) add("Role", auditLabel(role));
    else if (previous) add("Previous role", auditLabel(previous));
  } else if (event.action.startsWith("org.invite.") && role)
    add("Invited role", auditLabel(role));
  else if (previous) add("Previous role", auditLabel(previous));
  if (
    event.action.startsWith("org.departure.") ||
    event.action.startsWith("org.member.")
  ) {
    add("Items transferred", detail.transferred);
    add("Items archived", detail.archived);
  }
  if (event.action === "org.router_models.updated")
    add("Models available", detail.model_count);
  if (
    event.action.startsWith("org.api_key.") ||
    event.action === "org.private_content.permission_changed"
  )
    add("Enabled", detail.enabled);
  if (event.action === "org.private_content.opened") add("Access", "Read-only");
  const purgeAfter = detailText(event, "purge_after");
  if (purgeAfter && !Number.isNaN(new Date(purgeAfter).getTime()))
    add("Scheduled deletion", auditTimestamp(purgeAfter, true));
  if (event.action.startsWith("export.")) {
    add("Format", detail.format);
    add("Documents exported", detail.document_count);
    add("Chats exported", detail.chat_count);
  }
  return fields;
}

export function auditSummary(event: AuditEvent, personal: boolean): string {
  const actor = personal ? "You" : auditActor(event);
  const subject = auditSubject(event);
  if (event.status !== "completed")
    return `${auditAction(event)} ${event.status === "failed" ? "failed" : event.status === "cancelled" ? "was cancelled" : `is ${event.status}`}.`;
  const name =
    subject.name === "-" ? `the ${subject.type.toLowerCase()}` : subject.name;
  if (event.action === "org.member.role_changed")
    return `${actor} changed the organization role for ${name}.`;
  if (
    event.action === "org.invite.created" ||
    event.action === "org.invite.resent"
  )
    return `${actor} ${event.action.endsWith("resent") ? "resent an invitation to" : "invited"} ${name}.`;
  if (event.action === "document.uploaded") return `${actor} uploaded ${name}.`;
  if (event.action === "document.edited") return `${actor} edited ${name}.`;
  if (event.action === "document.generated")
    return `${actor} generated ${name}.`;
  return `${auditAction(event)} by ${personal ? "you" : actor}`;
}

export function auditDestination(
  event: AuditEvent,
): { href: string; label: string } | null {
  if (event.review_id)
    return {
      href: `/tabular-reviews/${encodeURIComponent(event.review_id)}`,
      label: uiText("Open review"),
    };
  if (event.chat_id && event.surface !== "word")
    return {
      href: event.project_id
        ? `/projects/${encodeURIComponent(event.project_id)}/assistant/chat/${encodeURIComponent(event.chat_id)}`
        : `/assistant/chat/${encodeURIComponent(event.chat_id)}`,
      label: uiText("Open chat"),
    };
  if (event.project_id)
    return {
      href: `/projects/${encodeURIComponent(event.project_id)}`,
      label: uiText("Open project"),
    };
  const access = auditPrivateAccess(event);
  if (access && ["project", "chat", "tabular_review"].includes(access.kind)) {
    const target = {
      project: { path: "/projects/", label: uiText("Open project") },
      chat: { path: "/assistant/chat/", label: uiText("Open chat") },
      tabular_review: { path: "/tabular-reviews/", label: uiText("Open review") },
    }[access.kind as "project" | "chat" | "tabular_review"];
    return {
      href: `${target.path}${encodeURIComponent(access.item_id)}`,
      label: target.label,
    };
  }
  return null;
}
