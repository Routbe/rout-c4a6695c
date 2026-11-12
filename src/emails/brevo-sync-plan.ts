/**
 * Which code-built design goes to which Brevo template ID. Used by
 * `scripts/sync-brevo-templates.ts` and the tests; pure, no network.
 */
import {
  adminContactTemplate,
  brevoTemplate,
  subdomainClaimTemplate,
  type BrevoKind,
  type BuiltMail,
} from "./design/mails";
import {
  EMAIL_CATEGORY_FALLBACK,
  EMAIL_TEMPLATE_IDS,
  GLOBAL_FALLBACK_TEMPLATE_ID,
  type EmailCategory,
} from "./template-ids";

const KIND_FOR: Partial<Record<EmailCategory, BrevoKind>> = {
  login: "auth",
  form: "form",
  payment_confirmation: "payConfirm",
  payment_issue: "payIssue",
  renewal: "renewal",
  payment: "payment",
  cancellation: "cancel",
  refund: "refund",
};

export interface SyncItem {
  id: number;
  name: string;
  mail: BuiltMail;
}

export function buildSyncPlan(): SyncItem[] {
  const out = new Map<number, SyncItem>();
  const add = (id: number, name: string, mail: BuiltMail) => {
    if (id > 0 && !out.has(id)) out.set(id, { id, name, mail });
  };
  for (const [category, kind] of Object.entries(KIND_FOR) as [EmailCategory, BrevoKind][]) {
    for (const [lang, id] of Object.entries(EMAIL_TEMPLATE_IDS[category])) {
      add(id!, `ROUT · ${category} · ${lang}`, brevoTemplate(kind, lang));
    }
    // Category fallback = English version of the same design.
    add(EMAIL_CATEGORY_FALLBACK[category], `ROUT · ${category} · fallback`, brevoTemplate(kind, "en"));
  }
  add(GLOBAL_FALLBACK_TEMPLATE_ID, "ROUT · global fallback", brevoTemplate("auth", "en"));
  add(1, "ROUT · admin contact · nl", adminContactTemplate());
  add(2, "ROUT · subdomain claim · nl", subdomainClaimTemplate());
  return [...out.values()].sort((a, b) => a.id - b.id);
}
