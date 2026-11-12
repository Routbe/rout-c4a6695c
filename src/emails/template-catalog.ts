/**
 * Auditable catalogue of every Brevo template category ROUT actually uses.
 *
 * `template-ids.ts` owns the numbering scheme; this file documents *who* sends
 * which category and which `params` the Brevo template may reference. The audit
 * script (`scripts/audit-brevo-templates.ts`) and the unit tests both read this
 * catalogue, so documentation can never silently drift from the code.
 */

import type { EmailCategory } from "./template-ids";

export interface CatalogEntry {
  category: EmailCategory;
  /** Human label used in the generated documentation. */
  label: string;
  /** Where the mail is triggered from. */
  senders: string[];
  /** Params handed to Brevo, referenced as {{ params.X }} in the template. */
  params: string[];
}

export const TEMPLATE_CATALOG: CatalogEntry[] = [
  {
    category: "subdomain_claim",
    label: "Admin: subdomain root claim",
    senders: ["src/routes/api/claim-root.ts"],
    params: ["NAME", "EMAIL", "SUBDOMAIN"],
  },
  {
    category: "system",
    label: "Admin & system notifications",
    senders: ["src/lib/contact.server.ts → sendAdminNotification()"],
    params: ["NAME", "EMAIL", "SUBJECT", "MESSAGE", "DATE"],
  },
  {
    category: "login",
    label: "Magic link / login",
    senders: ["src/lib/auth/users.server.ts → mailAuthAction('magiclink')"],
    params: ["TITLE", "BODY", "CTA", "LINK", "MAGIC_LINK", "CODE", "CODE_LABEL", "FOOTER"],
  },
  {
    category: "confirmation",
    label: "Sign-up confirmation",
    senders: ["src/lib/auth/users.server.ts → mailAuthAction('signup')"],
    params: ["TITLE", "BODY", "CTA", "LINK", "MAGIC_LINK", "CODE", "CODE_LABEL", "FOOTER"],
  },
  {
    category: "recovery",
    label: "Password recovery",
    senders: ["src/lib/auth/users.server.ts → mailAuthAction('recovery')"],
    params: ["TITLE", "BODY", "CTA", "LINK", "MAGIC_LINK", "CODE", "CODE_LABEL", "FOOTER"],
  },
  {
    category: "email_change",
    label: "E-mail address change",
    senders: ["src/lib/auth/users.server.ts → mailAuthAction('email_change')"],
    params: ["TITLE", "BODY", "CTA", "LINK", "MAGIC_LINK", "CODE", "CODE_LABEL", "FOOTER"],
  },
  {
    category: "reauthentication",
    label: "Re-authentication code",
    senders: ["src/lib/auth/users.server.ts → mailAuthAction('reauthentication')"],
    params: ["TITLE", "BODY", "CTA", "LINK", "MAGIC_LINK", "CODE", "CODE_LABEL", "FOOTER"],
  },
  {
    category: "invite",
    label: "Invites & promo codes",
    senders: [
      "src/lib/promo-admin.server.ts → sendPromoInvite()",
      "src/lib/auth/users.server.ts → mailAuthAction('invite')",
    ],
    params: ["PROMO_CODE", "DISCOUNT", "EXPIRES_AT", "LANGUAGE", "LINK", "TITLE", "BODY", "CTA"],
  },
  {
    category: "deletion",
    label: "Account deletion",
    senders: ["reserved — no active sender yet"],
    params: ["TITLE", "BODY", "CTA", "LINK", "FOOTER"],
  },
  {
    category: "form",
    label: "Contact form confirmation",
    senders: ["src/lib/contact.server.ts → sendVisitorAutoReply()"],
    params: ["NAME", "SUBJECT", "MESSAGE"],
  },
  {
    category: "payment_confirmation",
    label: "Billing — payment confirmation (received / processing)",
    senders: ["src/lib/notifications.server.ts → notifyUser('payment_processing')"],
    params: ["TITLE", "BODY", "CTA", "LINK", "NAME", "AMOUNT", "CURRENCY", "REFERENCE", "INVOICE_ID", "TIER", "DATE"],
  },
  {
    category: "welcome",
    label: "Welcome / account registration",
    senders: ["src/lib/auth/users.server.ts → welcome mail after first sign-up"],
    params: ["TITLE", "BODY", "CTA", "LINK", "NAME", "HANDLE"],
  },
  {
    category: "provisioning",
    label: "Node provisioning / deployment online",
    senders: ["reserved — node provisioning pipeline"],
    params: ["TITLE", "BODY", "CTA", "LINK", "NODE_NAME", "REGION", "DATE"],
  },
  {
    category: "renewal",
    label: "Billing — subscription renewal",
    senders: ["src/lib/notifications.server.ts → notifyUser('subscription_renewed')"],
    params: ["TITLE", "BODY", "CTA", "LINK", "NAME", "AMOUNT", "CURRENCY", "TIER", "PLAN", "DATE"],
  },
  {
    category: "cancellation",
    label: "Billing — subscription cancellation",
    senders: ["src/lib/notifications.server.ts → notifyUser('subscription_cancelled')"],
    params: ["TITLE", "BODY", "CTA", "LINK", "NAME", "TIER", "PLAN", "ENDS_AT", "END_DATE", "DATE"],
  },
  {
    category: "refund",
    label: "Billing — refund & credit note",
    senders: ["src/lib/notifications.server.ts → notifyUser('payment_refunded')"],
    params: ["TITLE", "BODY", "CTA", "LINK", "NAME", "AMOUNT", "CURRENCY", "REFERENCE", "CREDIT_ID", "REASON", "DATE"],
  },
  {
    category: "payment",
    label: "Billing — payment succeeded & invoice",
    senders: [
      "src/lib/notifications.server.ts → notifyUser('payment_succeeded' | 'payment_processing' | 'subscription_renewed')",
      "src/lib/sepa-matching.server.ts → activate() (level 1 bank match)",
    ],
    params: ["TITLE", "BODY", "CTA", "LINK", "AMOUNT", "CURRENCY", "REFERENCE", "TIER", "DATE"],
  },
  {
    category: "payment_issue",
    label: "Payment problems (failed, expired, cancelled by PSP)",
    senders: [
      "src/lib/notifications.server.ts → notifyUser('payment_failed' | 'payment_expired' | 'payment_refunded' | 'subscription_cancelled')",
      "src/lib/verification.functions.ts → Stripe status checks (3DS / Klarna aborts)",
    ],
    params: ["TITLE", "BODY", "CTA", "LINK", "AMOUNT", "REASON", "REFERENCE", "DATE"],
  },
  {
    category: "transfer",
    label: "Manual SEPA transfer follow-up (missing reference / mismatch)",
    senders: [
      "src/lib/sepa-matching.server.ts → notifyUser('transfer_received_unmatched' | 'transfer_name_mismatch')",
    ],
    params: ["TITLE", "BODY", "CTA", "LINK", "AMOUNT", "REFERENCE", "SENDER_NAME", "REASON"],
  },
  {
    category: "security",
    label: "Account freeze / unfreeze, password change & new device alerts",
    senders: [
      "src/lib/account-status.server.ts → notifyUser('account_frozen' | 'account_unfrozen')",
      "src/lib/notifications.server.ts → notifyUser('password_changed')",
      "src/lib/notifications.server.ts → notifyUser('new_device_login')",
    ],
    params: ["TITLE", "BODY", "CTA", "LINK", "DATE", "IP", "REASON", "DEVICE", "LOCATION"],
  },
  {
    category: "node_expiry",
    label: "Node / data expiry warning before permanent deletion",
    senders: [
      "src/lib/notifications.server.ts → notifyUser('node_expiry_warning' | 'node_expiry_final')",
    ],
    params: ["TITLE", "BODY", "CTA", "LINK", "NODE_NAME", "WIPES_AT", "EXPORT_LINK", "DATE"],
  },
  {
    category: "merge",
    label: "Sovereign Account Merge verification",
    senders: ["src/lib/account-merge.server.ts → createMergeTicket()"],
    params: ["TITLE", "BODY", "CTA", "LINK", "CODE", "EXPIRES_AT", "PRIMARY_HANDLE"],
  },
];

/** Mails that intentionally bypass templates and use inline HTML instead. */
export const INLINE_ONLY_SENDERS = [
  "src/lib/notifications.server.ts → notifyUser() (payment status mails)",
  "src/lib/forwarding.server.ts → sendConfirmationEmail() (double opt-in)",
  "src/lib/email-test.functions.ts → admin test mail",
];
