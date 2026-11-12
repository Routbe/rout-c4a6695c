/**
 * Server-only "Forward to" double opt-in.
 *
 * Setting a forwarding address never activates mail forwarding on its own: the
 * address is stored as unconfirmed together with a single-use token, and the
 * ImprovMX alias is only (re)provisioned once the owner clicks the confirmation
 * link from that inbox.
 */

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export type ForwardingState = {
  email: string | null;
  verified: boolean;
  pending: boolean;
  alias: string | null;
};

function token(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

export async function readForwardingState(userId: string): Promise<ForwardingState> {
  const { sql } = await import("@/lib/neon");
  const rows = (await sql`
    select username, forwarding_email, forwarding_email_verified, forwarding_email_token
      from public.profiles
     where id = ${userId}
     limit 1
  `) as Record<string, unknown>[];
  const data = rows[0];

  const email = (data?.["forwarding_email"] as string | null) ?? null;
  const verified = Boolean(data?.["forwarding_email_verified"]);
  return {
    email,
    verified,
    pending: Boolean(email) && !verified && Boolean(data?.["forwarding_email_token"]),
    alias: data?.["username"] ? `${data["username"]}@rout.be` : null,
  };
}

export type DeliveryResult = { sent: boolean; error?: string };

function confirmationHtml(url: string): string {
  return [
    "<p>Confirm that this inbox should receive mail from your ROUT alias.</p>",
    `<p><a href="${url}">Confirm this address</a></p>`,
    "<p>This link expires in 24 hours. If you did not request it, ignore this e-mail.</p>",
  ].join("");
}

/**
 * Sends the double opt-in link through Brevo — the single mail provider for the
 * whole stack; rout.be carries its SPF/DKIM records. When no key is configured
 * the call reports the reason instead of throwing: the token stays valid and the
 * UI surfaces a copyable fallback link.
 */
async function sendConfirmationEmail(to: string, url: string): Promise<DeliveryResult> {
  const { sendMail } = await import("@/emails/send.server");
  return sendMail({
    to,
    subject: "Confirm your ROUT forwarding address",
    html: confirmationHtml(url),
    tags: ["forwarding-confirmation"],
  });
}

/**
 * Rate limits voor bevestigingsmails ("limits are enough"): elk adres moet een
 * bevestigingslink kunnen ontvangen, maar misbruik als spam-engine wordt
 * rekenkundig onmogelijk gemaakt. Strikte backend-grenzen:
 *   • max 3 mails per 10 minuten per account
 *   • max 5 mails per dag per account
 *   • max 2 mails per dag naar hetzelfde ontvangeradres
 */
const RATE_LIMITS = {
  perUserPer10Min: 3,
  perUserPerDay: 5,
  perRecipientPerDay: 2,
} as const;

/**
 * Controleert alle drie de grenzen en logt de verzending bij toestemming.
 * Geeft `null` terug wanneer de mail verstuurd mag worden, anders de reden.
 * Fail-closed: een databasefout blokkeert de verzending liever dan dat een
 * limiet stilletjes verdwijnt.
 */
async function checkAndRecordSend(
  userId: string,
  recipient: string,
): Promise<"rate_limited_user" | "rate_limited_recipient" | "unavailable" | null> {
  try {
    const { sql } = await import("@/lib/neon");

    const counts = (await sql`
      select
        count(*) filter (where sent_at > now() - interval '10 minutes') as recent_user,
        count(*) filter (where sent_at > now() - interval '1 day') as daily_user,
        (select count(*) from public.forwarding_confirmation_sends
          where lower(recipient) = ${recipient}
            and sent_at > now() - interval '1 day') as daily_recipient
      from public.forwarding_confirmation_sends
      where user_id = ${userId}
    `) as Record<string, unknown>[];
    const row = counts[0] ?? {};

    if (Number(row["recent_user"] ?? 0) >= RATE_LIMITS.perUserPer10Min)
      return "rate_limited_user";
    if (Number(row["daily_user"] ?? 0) >= RATE_LIMITS.perUserPerDay)
      return "rate_limited_user";
    if (Number(row["daily_recipient"] ?? 0) >= RATE_LIMITS.perRecipientPerDay)
      return "rate_limited_recipient";

    await sql`
      insert into public.forwarding_confirmation_sends (user_id, recipient)
      values (${userId}, ${recipient})
    `;
    return null;
  } catch (error) {
    console.error("[forwarding:rate-limit:failed]", error);
    return "unavailable";
  }
}

export async function requestForwardingConfirmation(
  userId: string,
  rawEmail: string,
): Promise<{
  ok: boolean;
  sent: boolean;
  reason?: string;
  confirmUrl?: string;
  deliveryError?: string;
}> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, sent: false, reason: "invalid_email" };
  }

  const { assertEntitled } = await import("./entitlement.server");
  await assertEntitled(userId); // throws NotEntitledError for free accounts

  const limited = await checkAndRecordSend(userId, email);
  if (limited) return { ok: false, sent: false, reason: limited };

  const { sql } = await import("@/lib/neon");
  const value = token();

  try {
    await sql`
      update public.profiles
         set forwarding_email = ${email},
             forwarding_email_verified = false,
             forwarding_email_token = ${value},
             forwarding_email_token_expires_at = ${new Date(Date.now() + TOKEN_TTL_MS).toISOString()},
             alias_status = 'pending'
       where id = ${userId}
    `;
  } catch (error) {
    return {
      ok: false,
      sent: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  // Any live alias must stop delivering to the unconfirmed address.
  try {
    const { pauseAlias } = await import("./alias.server");
    const rows = (await sql`
      select username from public.profiles where id = ${userId} limit 1
    `) as Record<string, unknown>[];
    const username = rows[0]?.["username"] as string | undefined;
    if (username) await pauseAlias(username);
  } catch {
    /* ImprovMX is optional — never block the opt-in on it. */
  }

  // The link origin is fixed server-side; a caller can never choose where the
  // confirmation e-mail points to.
  const { canonicalAppUrl } = await import("./app-url");
  const confirmUrl = `${canonicalAppUrl().replace(/\/$/, "")}/api/public/email/confirm-forward?token=${value}`;
  const delivery = await sendConfirmationEmail(email, confirmUrl);
  return {
    ok: true,
    sent: delivery.sent,
    // On a delivery failure the caller shows the link so the opt-in can still
    // be completed manually instead of silently stalling.
    ...(delivery.sent ? {} : { confirmUrl, deliveryError: delivery.error }),
  };
}

/** Consumes the token, marks the address confirmed and provisions the alias. */
export async function confirmForwardingToken(
  value: string,
): Promise<{ ok: boolean; reason?: string; email?: string }> {
  if (!value || value.length < 20) return { ok: false, reason: "invalid" };
  const { sql } = await import("@/lib/neon");

  const rows = (await sql`
    select id, forwarding_email, forwarding_email_token_expires_at
      from public.profiles
     where forwarding_email_token = ${value}
     limit 1
  `) as Record<string, unknown>[];
  const profile = rows[0];

  if (!profile) return { ok: false, reason: "invalid" };
  const expires = profile["forwarding_email_token_expires_at"]
    ? Date.parse(profile["forwarding_email_token_expires_at"] as string)
    : 0;
  if (!expires || expires < Date.now()) return { ok: false, reason: "expired" };

  await sql`
    update public.profiles
       set forwarding_email_verified = true,
           forwarding_email_token = null,
           forwarding_email_token_expires_at = null
     where id = ${profile["id"]}
  `;

  try {
    const { provisionAliasForUser } = await import("./alias.server");
    await provisionAliasForUser(profile["id"] as string);
  } catch {
    /* alias provisioning is best effort */
  }

  return { ok: true, email: (profile["forwarding_email"] as string | null) ?? undefined };
}
