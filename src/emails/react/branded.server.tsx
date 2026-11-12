/**
 * Wraps a server-built HTML fragment (already escaped by its caller) in the one
 * ROUT mail design (`design/layout.ts` shell: light card, bunny header, status
 * badge, desk signature, shared footer). Returns null on any render error, so
 * the caller falls back to the Brevo template cascade.
 */
import { shell, type Accent } from "@/emails/design/layout";
import { copyFor, type CopyPack } from "@/emails/design/copy";
import { EMAIL_LANGUAGES } from "@/emails/template-ids";

type DeskKey = keyof CopyPack["desks"];

/** Badge, accent and signing desk per mail category. */
const CATEGORY_STYLE: Record<string, { badge: string; accent: Accent; desk: DeskKey }> = {
  login: { badge: "AUTH NODE", accent: "auth", desk: "auth" },
  confirmation: { badge: "VERIFY", accent: "auth", desk: "auth" },
  recovery: { badge: "SECURITY", accent: "warning", desk: "auth" },
  email_change: { badge: "SECURITY", accent: "warning", desk: "auth" },
  reauthentication: { badge: "SECURITY", accent: "auth", desk: "auth" },
  security: { badge: "SECURITY", accent: "danger", desk: "auth" },
  merge: { badge: "ACCOUNT MERGE", accent: "warning", desk: "identity" },
  deletion: { badge: "DELETION", accent: "danger", desk: "auth" },
  invite: { badge: "INVITE", accent: "creator", desk: "desk" },
  welcome: { badge: "WELCOME", accent: "success", desk: "desk" },
  form: { badge: "RECEIVED", accent: "success", desk: "desk" },
  payment: { badge: "PAID", accent: "paid", desk: "billing" },
  payment_confirmation: { badge: "PAID", accent: "paid", desk: "billing" },
  payment_issue: { badge: "ACTION REQUIRED", accent: "danger", desk: "billing" },
  renewal: { badge: "RENEWAL", accent: "warning", desk: "billing" },
  cancellation: { badge: "CANCELED", accent: "neutral", desk: "billing" },
  refund: { badge: "CREDIT NOTE", accent: "info", desk: "billing" },
  transfer: { badge: "TRANSFER", accent: "warning", desk: "billing" },
  provisioning: { badge: "ONLINE", accent: "success", desk: "ops" },
  node_expiry: { badge: "EXPIRY", accent: "danger", desk: "ops" },
  system: { badge: "SYSTEM NODE", accent: "neutral", desk: "ops" },
};

export function styleFor(category?: string) {
  return CATEGORY_STYLE[category ?? ""] ?? { badge: "NOTICE", accent: "ink" as Accent, desk: "desk" as DeskKey };
}

/** Kept for callers/tests: drops inline colour declarations. */
export function stripLightColors(fragment: string): string {
  return fragment.replace(/style="([^"]*)"/gi, (_, css: string) => {
    const kept = css
      .split(";")
      .map((d) => d.trim())
      .filter((d) => d && !/^(color|background(-color)?)\s*:/i.test(d))
      .join(";");
    return kept ? `style="${kept}"` : "";
  });
}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export async function brandHtml(
  fragment: string,
  opts: { language?: unknown; preview?: string; category?: string },
): Promise<string | null> {
  try {
    const raw = typeof opts.language === "string" ? opts.language.slice(0, 2).toLowerCase() : "nl";
    const lang = (EMAIL_LANGUAGES as readonly string[]).includes(raw) ? raw : "en";
    const s = styleFor(opts.category);
    const title = (opts.preview ?? "ROUT").replace(/</g, "&lt;");
    return shell({
      lang,
      title,
      preheader: stripTags(fragment).slice(0, 140) || title,
      badge: s.badge,
      accent: s.accent,
      desk: copyFor(lang).desks[s.desk],
      body: [fragment],
    });
  } catch (err) {
    console.error("[email] brand render failed, using Brevo template", err instanceof Error ? err.message : err);
    return null;
  }
}
