/**
 * Signup block on public profiles, zero-knowledge for everyone but the owner.
 *
 * - Addresses are encrypted before they reach the database; only a keyed hash
 *   is stored for de-duplication (see subscribers/subscriber-crypto.server.ts).
 * - Public writes go through definer functions that never return addresses.
 * - Owners read their own rows only through RLS (rout.current_user_id), and
 *   only the Studio CSV export decrypts them.
 * - Double opt-in: the visitor confirms through a one-time link; optional Brevo
 *   sync happens after that confirmation only.
 */
import { sql } from "@/lib/neon";
import {
  newSubscriberToken,
  openSubscriberEmail,
  sealSubscriberEmail,
  subscriberEmailHash,
  subscriberKeyConfigured,
  subscriberTokenHash,
} from "@/lib/subscribers/subscriber-crypto.server";
import { buildSubscribersCsv, isSubscriberToken, normalizeSubscriberEmail, type SubscriberCsvRow, type SubscriberStatus } from "@/lib/subscribers/subscriber-rules";

type Row = Record<string, unknown>;
type Lang = "nl" | "en" | "fr" | "de";

const BREVO_CONTACTS = "https://api.brevo.com/v3/contacts";

const MESSAGES: Record<Lang, Record<"pending" | "already" | "failed" | "unavailable" | "limited", string>> = {
  nl: {
    pending: "Bijna klaar: bevestig je inschrijving via de mail die we je stuurden.",
    already: "Je bent al ingeschreven.",
    failed: "Inschrijven lukte niet. Probeer het later opnieuw.",
    unavailable: "Inschrijven is op dit profiel niet beschikbaar.",
    limited: "Te veel pogingen. Probeer het later opnieuw.",
  },
  en: {
    pending: "Almost done: confirm your subscription through the e-mail we sent you.",
    already: "You are already subscribed.",
    failed: "Subscribing failed. Please try again later.",
    unavailable: "Subscribing is not available on this profile.",
    limited: "Too many attempts. Please try again later.",
  },
  fr: {
    pending: "Presque fini : confirmez votre inscription via l'e-mail envoyé.",
    already: "Vous êtes déjà inscrit·e.",
    failed: "L'inscription a échoué. Réessayez plus tard.",
    unavailable: "L'inscription n'est pas disponible sur ce profil.",
    limited: "Trop de tentatives. Réessayez plus tard.",
  },
  de: {
    pending: "Fast fertig: Bestätige deine Anmeldung über die E-Mail, die wir dir geschickt haben.",
    already: "Du bist bereits angemeldet.",
    failed: "Die Anmeldung ist fehlgeschlagen. Bitte versuche es später erneut.",
    unavailable: "Die Anmeldung ist auf diesem Profil nicht verfügbar.",
    limited: "Zu viele Versuche. Bitte versuche es später erneut.",
  },
};

const MAIL: Record<Lang, { subject: (h: string) => string; body: (h: string) => string; confirm: string; leave: string; ignore: string }> = {
  nl: { subject: (h) => `Bevestig je inschrijving bij ${h}`, body: (h) => `Je vroeg om updates van ${h} op ROUT.`, confirm: "Inschrijving bevestigen", leave: "Afmelden", ignore: "Was jij dit niet? Negeer deze mail; zonder bevestiging gebeurt er niets." },
  en: { subject: (h) => `Confirm your subscription to ${h}`, body: (h) => `You asked for updates from ${h} on ROUT.`, confirm: "Confirm subscription", leave: "Unsubscribe", ignore: "Not you? Ignore this e-mail; nothing happens without confirmation." },
  fr: { subject: (h) => `Confirmez votre inscription à ${h}`, body: (h) => `Vous avez demandé des nouvelles de ${h} sur ROUT.`, confirm: "Confirmer l'inscription", leave: "Se désinscrire", ignore: "Ce n'était pas vous ? Ignorez cet e-mail ; rien ne se passe sans confirmation." },
  de: { subject: (h) => `Bestätige deine Anmeldung bei ${h}`, body: (h) => `Du hast Neuigkeiten von ${h} auf ROUT angefordert.`, confirm: "Anmeldung bestätigen", leave: "Abmelden", ignore: "Warst du das nicht? Ignoriere diese E-Mail; ohne Bestätigung passiert nichts." },
};

const langOf = (v: string | null | undefined): Lang => {
  const l = (v ?? "").slice(0, 2).toLowerCase();
  return l === "en" || l === "fr" || l === "de" ? l : "nl";
};
const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

async function publicOrigin(): Promise<string> {
  const { canonicalAppUrl } = await import("@/lib/app-url");
  return canonicalAppUrl().replace(/\/+$/, "");
}

async function sendConfirmation(email: string, handle: string, lang: Lang, confirmToken: string, leaveToken: string) {
  const origin = await publicOrigin();
  const m = MAIL[lang];
  const confirmUrl = `${origin}/subscribe/confirm?t=${confirmToken}`;
  const leaveUrl = `${origin}/subscribe/leave?t=${leaveToken}`;
  const shown = `@${handle}`;
  const html =
    `<p>${escapeHtml(m.body(shown))}</p>` +
    `<p><a href="${confirmUrl}">${escapeHtml(m.confirm)}</a></p>` +
    `<p style="color:#666;font-size:12px">${escapeHtml(m.ignore)}<br><a href="${leaveUrl}">${escapeHtml(m.leave)}</a></p>`;
  const text = `${m.body(shown)}\n\n${m.confirm}: ${confirmUrl}\n\n${m.ignore}\n${m.leave}: ${leaveUrl}\n`;
  const { sendMail } = await import("@/emails/send.server");
  return sendMail({ to: email, subject: m.subject(shown), html, text, language: lang, tags: ["profile-signup"], skipAdminAlert: true });
}

/** Public: one visitor signs up on a profile. Never reveals whether an address exists elsewhere. */
export async function subscribeToNewsletter(params: {
  handle: string;
  email: string;
  locale?: string | null;
  ip?: string | null;
}): Promise<{ ok: boolean; status: "pending" | "already" | "error"; message: string }> {
  const lang = langOf(params.locale);
  const msg = MESSAGES[lang];
  const handle = params.handle.trim().replace(/^@+/, "").toLowerCase();
  const email = normalizeSubscriberEmail(params.email);
  if (!email || !handle) return { ok: false, status: "error", message: msg.failed };
  if (!subscriberKeyConfigured()) {
    console.error("[signup] SUBSCRIBER_ENCRYPTION_KEY missing; refusing to store addresses.");
    return { ok: false, status: "error", message: msg.unavailable };
  }

  const { hitRateLimit } = await import("@/lib/rate-limit-db.server");
  const emailHash = await subscriberEmailHash(email);
  const [byIp, byEmail] = await Promise.all([
    hitRateLimit("signup-ip", `${params.ip ?? "unknown"}:${handle}`, { limit: 5, windowSec: 600 }, { failClosed: true }),
    // Confirmation mails to one address are capped so the form cannot be used to flood a mailbox.
    hitRateLimit("signup-mail", emailHash, { limit: 3, windowSec: 86_400 }, { failClosed: true }),
  ]);
  if (!byIp.ok || !byEmail.ok) return { ok: false, status: "error", message: msg.limited };

  const confirm = await newSubscriberToken();
  const leave = await newSubscriberToken();
  try {
    // The owner id is needed for the ciphertext binding, so resolve it first through the same definer path.
    const probe = (await sql`
      select p.id as owner, 'root' as space from public.profiles p where lower(p.username) = ${handle}
      union all
      select a.user_id, 'alias' from public.alias_profiles a where lower(a.handle) = ${handle}
      limit 1
    `) as Row[];
    const owner = probe[0]?.["owner"] ? String(probe[0]["owner"]) : null;
    const space = probe[0]?.["space"] === "alias" ? "alias" : "root";
    if (!owner) return { ok: false, status: "error", message: msg.unavailable };
    const sealed = await sealSubscriberEmail(email, owner, space);
    const rows = (await sql`
      select outcome, out_owner, out_space from public.rout_subscriber_join(
        ${handle}, ${emailHash}, ${sealed.ciphertext}, ${sealed.iv}, ${confirm.hash}, ${leave.hash}, ${lang}
      )
    `) as Row[];
    const outcome = String(rows[0]?.["outcome"] ?? "");
    if (outcome === "already") return { ok: true, status: "already", message: msg.already };
    if (outcome !== "pending" || String(rows[0]?.["out_owner"]) !== owner || rows[0]?.["out_space"] !== space) {
      return { ok: false, status: "error", message: msg.unavailable };
    }
  } catch (error) {
    console.error("[signup] could not store subscription", (error as { code?: string })?.code ?? "unknown");
    return { ok: false, status: "error", message: msg.failed };
  }

  const sent = await sendConfirmation(email, handle, lang, confirm.token, leave.token).catch(() => ({ sent: false }));
  if (!sent.sent) console.warn("[signup] confirmation mail not sent; subscription stays pending.");
  return { ok: true, status: "pending", message: msg.pending };
}

/** Public: confirmation link (one-time, 7 days). Syncs to Brevo only after this. */
export async function confirmSubscription(token: string): Promise<{ ok: boolean; handle?: string }> {
  if (!isSubscriberToken(token)) return { ok: false };
  const rows = (await sql`select * from public.rout_subscriber_confirm(${await subscriberTokenHash(token)})`) as Row[];
  const row = rows[0];
  if (!row) return { ok: false };
  const handle = String(row["handle"]);
  const listId = row["list_id"] == null ? null : Number(row["list_id"]);
  const key = process.env["BREVO_API_KEY"];
  if (key && listId) {
    const email = await openSubscriberEmail(String(row["email_ciphertext"]), String(row["email_iv"]), String(row["owner_user_id"]), String(row["space"]));
    if (email) {
      let ok = false;
      let detail = "";
      try {
        const res = await fetch(BREVO_CONTACTS, {
          method: "POST",
          headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ email, listIds: [listId], updateEnabled: true, attributes: { ROUT_HANDLE: handle } }),
        });
        detail = res.ok ? "" : (await res.text().catch(() => "")).slice(0, 200);
        ok = res.ok || detail.includes("duplicate_parameter");
        if (!ok && !detail) detail = `HTTP ${res.status}`;
      } catch {
        detail = "network";
      }
      await sql`select public.rout_subscriber_sync_result(${String(row["id"])}::uuid, ${ok}, ${ok ? null : detail})`.catch(() => undefined);
    }
  }
  return { ok: true, handle };
}

/** Public: unsubscribe link from the confirmation mail. Wipes the encrypted address. */
export async function unsubscribe(token: string): Promise<{ ok: boolean }> {
  if (!isSubscriberToken(token)) return { ok: false };
  const rows = (await sql`select public.rout_subscriber_unsubscribe(${await subscriberTokenHash(token)}) as ok`) as Row[];
  return { ok: rows[0]?.["ok"] === true };
}

export interface MySubscriberSummary {
  total: number;
  confirmed: number;
  pending: number;
  unsubscribed: number;
  perProfile: Array<{ handle: string; space: "root" | "alias"; confirmed: number; pending: number }>;
}

/** Owner only (RLS): counts, never addresses. */
export async function mySubscriberSummary(): Promise<MySubscriberSummary> {
  const rows = (await sql`
    select handle, space,
           count(*) filter (where status = 'confirmed')::int as confirmed,
           count(*) filter (where status = 'pending')::int as pending,
           count(*) filter (where status = 'unsubscribed')::int as unsubscribed
      from public.profile_subscribers
     group by handle, space order by handle
  `) as Row[];
  const perProfile = rows.map((r) => ({
    handle: String(r["handle"]),
    space: (r["space"] === "alias" ? "alias" : "root") as "root" | "alias",
    confirmed: Number(r["confirmed"] ?? 0),
    pending: Number(r["pending"] ?? 0),
  }));
  const sum = (k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const confirmed = sum("confirmed");
  const pending = sum("pending");
  const unsubscribed = sum("unsubscribed");
  return { total: confirmed + pending + unsubscribed, confirmed, pending, unsubscribed, perProfile };
}

/** Owner only (RLS + explicit owner filter): decrypts and returns the CSV. */
export async function exportMySubscribersCsv(userId: string, opts: { confirmedOnly?: boolean } = {}): Promise<{ csv: string; count: number }> {
  if (!subscriberKeyConfigured()) throw new Error("subscriber_key_missing");
  const rows = (await sql`
    select owner_user_id, handle, space, status, email_ciphertext, email_iv, created_at, confirmed_at
      from public.profile_subscribers
     where owner_user_id = ${userId} and status <> 'unsubscribed'
     order by created_at asc
     limit 20000
  `) as Row[];
  const plain: SubscriberCsvRow[] = [];
  for (const r of rows) {
    if (String(r["owner_user_id"]) !== userId) continue;
    const space = r["space"] === "alias" ? "alias" : "root";
    const email = await openSubscriberEmail(String(r["email_ciphertext"] ?? ""), String(r["email_iv"] ?? ""), userId, space);
    if (!email) continue;
    plain.push({
      email,
      handle: String(r["handle"]),
      space: space as "root" | "alias",
      status: String(r["status"]) as SubscriberStatus,
      createdAt: new Date(String(r["created_at"])).toISOString(),
      confirmedAt: r["confirmed_at"] ? new Date(String(r["confirmed_at"])).toISOString() : null,
    });
  }
  const csv = buildSubscribersCsv(plain, opts);
  const count = plain.filter((p) => !opts.confirmedOnly || p.status === "confirmed").length;
  return { csv, count };
}

/** Admin overview: aggregate counts only. */
export async function platformSubscriberCounts() {
  const rows = (await sql`select * from public.rout_subscriber_platform_counts()`) as Row[];
  const r = rows[0] ?? {};
  return {
    total: Number(r["total"] ?? 0),
    pending: Number(r["pending"] ?? 0),
    confirmed: Number(r["confirmed"] ?? 0),
    unsubscribed: Number(r["unsubscribed"] ?? 0),
    synced: Number(r["synced"] ?? 0),
    failed: Number(r["failed"] ?? 0),
  };
}
