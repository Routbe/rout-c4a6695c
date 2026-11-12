import { sql, withDbContext } from "@/lib/neon";
import { hashToken } from "@/lib/auth/token-hash.server";
import { canExecute, pickConversionDesign, suggestedConversionSlug, type ConversionDraft, checkTarget, readConversionDetails, statusAfter, SUNSET_DAYS, SUNSET_MEMBER_ROLE, type ConversionDetails, type TransferStatus } from "./workspace-conversion-rules";
import { isValidWorkspaceSlug } from "./workspace-rules";

/**
 * Personal-to-Workspace conversion. Both sides consent (e-mail code on the
 * source account + acceptance by the human owner) before one transaction
 * moves everything. The old login keeps working for 30 days as an admin of the new
 * workspace, then the sunset scrubber removes it.
 */

type TransferRow = {
  id: string;
  source_user_id: string;
  target_user_id: string | null;
  target_email: string;
  workspace_name: string;
  otp_verified_at: string | null;
  accepted_at: string | null;
  status: TransferStatus;
  workspace_id: string | null;
  expires_at: string;
  details?: unknown;
};

/** Run as the account being converted: both consents are checked in code before this is used. */
function asSource<T>(sourceUserId: string, fn: () => Promise<T>): Promise<T> {
  return withDbContext({ userId: sourceUserId, workspaceId: null }, fn);
}

function siteUrl() {
  return (process.env["PUBLIC_SITE_URL"] ?? "https://rout.be").replace(/\/$/, "");
}

async function safeCount(q: Promise<unknown>): Promise<number> {
  try {
    const rows = (await q) as { n: number | string }[];
    return Number(rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

export async function preflight(userId: string) {
  const [links, qrs, domains, apps, badges, verified, user] = await Promise.all([
    safeCount(sql`select count(*)::int as n from public.social_links where profile_id = ${userId}`),
    safeCount(sql`select count(*)::int as n from public.tracked_qrs where user_id = ${userId}`),
    safeCount(sql`select count(distinct d)::int as n from (
      select custom_domain as d from public.tracked_qrs where user_id = ${userId} and custom_domain is not null
      union select subdomain_alias from public.profiles where id = ${userId} and subdomain_alias is not null) x`),
    safeCount(sql`select count(*)::int as n from public.oauth_clients where owner_user_id = ${userId}`),
    safeCount(sql`select count(*)::int as n from public.user_custom_badges where user_id = ${userId}`),
    safeCount(sql`select count(*)::int as n from public.identity_verifications where user_id = ${userId} and is_verified`),
    sql`select app_metadata->>'stripe_customer_id' as stripe from public.users where id = ${userId}` as unknown as Promise<{ stripe: string | null }[]>,
  ]);
  const carry = await readCarryOver(userId).catch(() => null);
  return {
    suggestedSlug: suggestedConversionSlug(carry?.username, ""),
    verifiedDomain: carry?.domain ?? null,
    designs: carry ? Number(Boolean(carry.drafts.verified)) + Number(Boolean(carry.drafts.alias)) : 0,
    links,
    qrCodes: qrs,
    domains,
    apps,
    badges,
    hasBlueBadge: verified > 0,
    activeBilling: Boolean(user[0]?.stripe),
  };
}

export async function getOpenTransfer(userId: string) {
  const rows = (await sql`select id, source_user_id, target_user_id, target_email, workspace_name, otp_verified_at,
      accepted_at, status, workspace_id, expires_at from public.workspace_transfers
    where source_user_id = ${userId} and status in ('pending','otp_ok','accepted') and expires_at > now()
    order by created_at desc limit 1`) as TransferRow[];
  return rows[0] ?? null;
}

export async function startConversion(
  user: { id: string; email: string },
  input: { workspaceName: string; target: string; details: ConversionDetails },
  request: Request | null,
) {
  const raw = input.target.trim();
  const isEmail = raw.includes("@") && !raw.startsWith("@");
  // Owner by e-mail or @username; accounts are looked up through a narrow server-only helper.
  const found = (await sql`select user_id as id, email from public.rout_resolve_account(${raw})`) as { id: string; email: string }[];
  const target = found[0] ?? null;
  if (!isEmail && !target) return { ok: false as const, reason: "unknown_user" as const };
  const err = checkTarget(user.id, user.email, { userId: target?.id ?? null, email: target?.email ?? raw });
  if (err) return { ok: false as const, reason: err };

  // Abuse cap: a handful of conversion attempts per day, so the flow cannot be used to mail many addresses.
  const recent = (await sql`select count(*)::int as n from public.workspace_transfers
    where source_user_id = ${user.id} and created_at > now() - interval '24 hours'`) as { n: number }[];
  if (Number(recent[0]?.n ?? 0) >= MAX_TRANSFERS_PER_DAY) return { ok: false as const, reason: "too_many_attempts" as const };

  // The stored hash is a placeholder: no usable link exists until the source confirms
  // its own e-mail code, and only then does the owner receive an invitation.
  const placeholder = crypto.randomUUID() + crypto.randomUUID();
  await sql`update public.workspace_transfers set status = 'cancelled'
    where source_user_id = ${user.id} and status in ('pending','otp_ok','accepted')`;
  await sql`insert into public.workspace_transfers (source_user_id, target_user_id, target_email, workspace_name, token_hash, details)
    values (${user.id}, ${target?.id ?? null}, ${(target?.email ?? raw).toLowerCase()}, ${input.workspaceName}, ${await hashToken(placeholder)},
            ${JSON.stringify(input.details)}::jsonb)`;

  const { issueSecurityCode } = await import("@/lib/security-code.server");
  const code = await issueSecurityCode(user.id, "workspace_convert", request);
  if (!code.ok) return { ok: false as const, reason: code.reason };
  return { ok: true as const, sentTo: code.sentTo, ownerExists: Boolean(target) };
}

const MAX_TRANSFERS_PER_DAY = 3;

/** Sends the owner invitation with a fresh link; called only after the source confirmed its own code. */
async function sendOwnerInvite(t: TransferRow, request: Request | null) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const updated = (await sql`update public.workspace_transfers set token_hash = ${await hashToken(token)}
    where id = ${t.id} and source_user_id = ${t.source_user_id} and otp_verified_at is not null returning id`) as unknown[];
  if (!updated.length) return;
  const { sendLocalizedEmail, localeFromRequest } = await import("@/lib/email.server");
  void sendLocalizedEmail({
    to: t.target_email.toLowerCase(),
    intent: "workspace-owner-invite",
    locale: localeFromRequest(request),
    payload: { link: `${siteUrl()}/workspace-transfer/${token}`, name: t.workspace_name },
  }).catch(() => undefined);
}

export async function verifyConversionCode(userId: string, code: string, request: Request | null = null) {
  const { consumeSecurityCode } = await import("@/lib/security-code.server");
  const t = await getOpenTransfer(userId);
  if (!t) return { ok: false as const, reason: "no_transfer" as const };
  if (!(await consumeSecurityCode(userId, "workspace_convert", code))) return { ok: false as const, reason: "bad_code" as const };
  const status = statusAfter({ otpVerifiedAt: "now", acceptedAt: t.accepted_at });
  await sql`update public.workspace_transfers set otp_verified_at = now(), status = ${status} where id = ${t.id}`;
  const result = await asSource(userId, () => maybeExecute(t.id));
  // An owner who already accepted (signed in with the invited address) needs no e-mail.
  if (!result.completed && !t.accepted_at) await sendOwnerInvite(t, request).catch(() => undefined);
  return { ok: true as const, ...result };
}

async function transferByToken(token: string) {
  // The token holder is not yet a party of the transfer, so a definer helper finds it by hash only.
  const rows = (await sql`select id, source_user_id, target_user_id, target_email, workspace_name, otp_verified_at,
      accepted_at, status, workspace_id, expires_at from public.rout_transfer_by_token(${await hashToken(token)})`) as TransferRow[];
  return rows[0] ?? null;
}

export async function describeTransfer(token: string) {
  const t = await transferByToken(token);
  if (!t) return null;
  return { workspaceName: t.workspace_name, status: t.status, expired: new Date(t.expires_at) <= new Date() };
}

/** Owner accepts. Requires a verified e-mail that matches the invited address (or the invited user id). */
export async function acceptTransfer(user: { id: string; email: string; emailConfirmedAt: string | null }, token: string) {
  const t = await transferByToken(token);
  if (!t || t.status === "cancelled" || new Date(t.expires_at) <= new Date()) return { ok: false as const, reason: "invalid" as const };
  if (t.status === "completed") return { ok: true as const, completed: true, workspaceId: t.workspace_id };
  if (t.source_user_id === user.id) return { ok: false as const, reason: "same_account" as const };
  const matches = t.target_user_id ? t.target_user_id === user.id : t.target_email === user.email.toLowerCase();
  if (!matches) return { ok: false as const, reason: "wrong_account" as const };
  if (!user.emailConfirmedAt) return { ok: false as const, reason: "email_unverified" as const };
  const status = statusAfter({ otpVerifiedAt: t.otp_verified_at, acceptedAt: "now" });
  const result = await asSource(t.source_user_id, async () => {
    await sql`update public.workspace_transfers set accepted_at = now(), target_user_id = ${user.id}, status = ${status}
      where id = ${t.id} and status in ('pending','otp_ok')`;
    return maybeExecute(t.id);
  });
  return { ok: true as const, ...result };
}

/** Accepts invites waiting for a freshly verified account (called after sign-up / sign-in). */
export async function claimPendingTransfersForEmail(user: { id: string; email: string; emailConfirmedAt: string | null }) {
  if (!user.emailConfirmedAt) return;
  const rows = (await sql`select id, source_user_id from public.rout_transfers_for_email(${user.email.toLowerCase()})`) as { id: string; source_user_id: string }[];
  for (const r of rows) {
    await asSource(r.source_user_id, async () => {
      await sql`update public.workspace_transfers set accepted_at = now(), target_user_id = ${user.id},
        status = case when otp_verified_at is not null then 'accepted' else 'pending' end where id = ${r.id}`;
      await maybeExecute(r.id);
    });
  }
}

/** Runs the atomic move once both sides agreed. Idempotent: a completed transfer is never re-run. */
/** Must run inside asSource(): every statement acts as the converted account under RLS. */
async function maybeExecute(transferId: string): Promise<{ completed: boolean; workspaceId: string | null }> {
  const rows = (await sql`select id, source_user_id, target_user_id, target_email, workspace_name, otp_verified_at,
      accepted_at, status, workspace_id, expires_at, details from public.workspace_transfers where id = ${transferId}`) as TransferRow[];
  const t = rows[0];
  if (!t) return { completed: false, workspaceId: null };
  if (t.status === "completed") return { completed: true, workspaceId: t.workspace_id };
  const ready = canExecute(
    { status: t.status, otpVerifiedAt: t.otp_verified_at, acceptedAt: t.accepted_at, targetUserId: t.target_user_id, expiresAt: t.expires_at },
    new Date(),
  );
  if (!ready) return { completed: false, workspaceId: null };

  const ws = crypto.randomUUID();
  const src = t.source_user_id;
  const days = SUNSET_DAYS;
  const details = readConversionDetails(t.details);
  const carry = await readCarryOver(src);
  const slug = await pickSlug(details.slug, carry.username, t.workspace_name);
  const design = pickConversionDesign({ verified: carry.verified, verifiedDraft: carry.drafts.verified, aliasDraft: carry.drafts.alias });
  const withSlug = (p: Record<string, unknown> | null) => (p ? JSON.stringify({ ...p, username: slug }) : null);
  const live = withSlug(design.live);
  const concept = withSlug(design.concept);
  const { resolveInvites } = await import("./workspaces.server");
  const invites = (await resolveInvites(details.invites, src).catch((): Awaited<ReturnType<typeof resolveInvites>> => [])).filter((i) => i.userId !== t.target_user_id);

  // One transaction: if any statement fails, nothing changes.
  await sql.transaction([
    sql`update public.workspace_transfers set status = 'completed', completed_at = now()
        where id = ${t.id} and status = 'accepted' and otp_verified_at is not null and accepted_at is not null
          and target_user_id is not null and expires_at > now()`,
    sql`select public.wt_assert(exists(select 1 from public.workspace_transfers where id = ${t.id}
        and status = 'completed' and workspace_id is null), 'transfer_not_ready')`,
    sql`insert into public.workspaces (id, name, slug, stripe_customer_id, billing_name, vat_number, legacy_user_id, description, category)
        select ${ws}::uuid, ${t.workspace_name}, ${slug}, u.app_metadata->>'stripe_customer_id',
               coalesce(u.app_metadata->>'billing_name', ${t.workspace_name}), u.app_metadata->>'vat_number', u.id,
               ${details.description || null}, ${details.category}
        from public.users u where u.id = ${src}`,
    // Billing moves with the customer id: clear it on the user so nothing bills twice.
    sql`update public.users set app_metadata = coalesce(app_metadata, '{}'::jsonb) - 'stripe_customer_id'
        where id = ${src} and exists(select 1 from public.workspaces where id = ${ws}::uuid)`,
    sql`update public.workspace_transfers set workspace_id = ${ws}::uuid where id = ${t.id}`,
    // The old login stays usable for the sunset period as admin; the human owner is added next.
    sql`insert into public.workspace_members (workspace_id, user_id, role) values (${ws}::uuid, ${src}, ${SUNSET_MEMBER_ROLE})`,
    sql`insert into public.workspace_members (workspace_id, user_id, role)
        select ${ws}::uuid, target_user_id, 'owner' from public.workspace_transfers where id = ${t.id}`,
    ...invites.map((i) => sql`insert into public.workspace_invites (workspace_id, email, role, invited_by, invited_user_id)
        values (${ws}::uuid, ${i.email}, ${i.role}::public.workspace_role, ${src}, ${i.userId}::uuid)
        on conflict (workspace_id, lower(email)) where status = 'pending' do nothing`),
    // Design: the verified profile's design goes live, the other stays an unpublished concept.
    ...(concept ? [sql`insert into public.workspace_profile_drafts (workspace_id, payload, revision, published_revision, updated_by, published_at)
        values (${ws}::uuid, ${concept}::jsonb, ${live && live !== concept ? 2 : 1}, ${live ? (live !== concept ? 1 : 1) : 0}, ${src}, ${live ? new Date().toISOString() : null}::timestamptz)
        on conflict (workspace_id) do nothing`] : []),
    ...(live ? [sql`update public.workspaces set public_profile = coalesce(public_profile, '{}'::jsonb)
        || jsonb_build_object('published', true, 'studio', ${live}::jsonb) where id = ${ws}::uuid`] : []),
    // A verified domain moves along: the workspace page is served on it directly.
    ...(carry.domain ? [sql`update public.workspaces set domain = ${carry.domain}, domain_verified_at = now()
        where id = ${ws}::uuid and domain is null`] : []),
    sql`update public.profiles set workspace_id = ${ws}::uuid where id = ${src}`,
    sql`update public.tracked_qrs set workspace_id = ${ws}::uuid where user_id = ${src}`,
    sql`update public.oauth_clients set workspace_id = ${ws}::uuid where owner_user_id = ${src}`,
    sql`delete from public.identity_verifications where user_id = ${src}`,
    sql`update public.users set account_status = 'migrated_sunset', sunset_at = now() + make_interval(days => ${days}),
        migrated_to_workspace_id = ${ws}::uuid, updated_at = now() where id = ${src}`,
  ]);

  void notifyWorkspaceMembers(ws, t.workspace_name).catch(() => undefined);
  void moveStripeCustomer(ws).catch((e: unknown) => console.error("[workspace-convert] stripe", e instanceof Error ? e.message : "error"));
  return { completed: true, workspaceId: ws };
}

/** Billing continuity: the same Stripe customer now points at the workspace; subscriptions stay untouched. */
async function moveStripeCustomer(workspaceId: string) {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) return;
  const rows = (await sql`select stripe_customer_id from public.workspaces where id = ${workspaceId}`) as { stripe_customer_id: string | null }[];
  const customer = rows[0]?.stripe_customer_id;
  if (!customer) return;
  const body = new URLSearchParams({ "metadata[workspace_id]": workspaceId });
  const res = await fetch(`https://api.stripe.com/v1/customers/${encodeURIComponent(customer)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) console.error("[workspace-convert] stripe metadata", res.status, (await res.text()).slice(0, 300));
}

/** Onboarding mail to everyone who now belongs to the new workspace. Never blocks. */
async function notifyWorkspaceMembers(workspaceId: string, workspaceName: string) {
  const members = ((await sql`select email from public.rout_workspace_team(${workspaceId}::uuid)`) as { email: string | null }[])
    .filter((m): m is { email: string } => Boolean(m.email))
    .map((m) => ({ email: m.email, locale: null as string | null }));
  const { sendLocalizedEmail } = await import("@/lib/email.server");
  for (const m of members) {
    await sendLocalizedEmail({
      to: m.email,
      intent: "workspace-member-onboarding",
      locale: m.locale ?? "en",
      payload: { link: `${siteUrl()}/dashboard`, name: workspaceName },
    });
  }
}

export async function sunsetStatus(userId: string) {
  try {
    const rows = (await sql`select u.account_status, u.sunset_at, w.name as workspace_name from public.users u
      left join public.workspaces w on w.id = u.migrated_to_workspace_id where u.id = ${userId}`) as {
      account_status: string; sunset_at: string | null; workspace_name: string | null;
    }[];
    const r = rows[0];
    if (!r || r.account_status !== "migrated_sunset") return null;
    return { sunsetAt: r.sunset_at, workspaceName: r.workspace_name };
  } catch {
    return null; // migration not applied yet
  }
}

/** After the sunset: hard-delete the login so the e-mail address is free again; workspace data stays. */
export async function scrubSunsetAccounts(): Promise<{ scrubbed: number }> {
  const due = (await sql`select id, ba from public.rout_due_sunset_accounts()`) as { id: string; ba: string | null }[];
  for (const u of due) await withDbContext({ userId: u.id, workspaceId: null }, () => scrubOne(u));
  return { scrubbed: due.length };
}

async function scrubOne(u: { id: string; ba: string | null }) {
  {
    if (u.ba) {
      await sql`delete from neon_auth.session where "userId"::text = ${u.ba}`.catch(() => {});
      await sql`delete from neon_auth.account where "userId"::text = ${u.ba}`.catch(() => {});
      await sql`delete from neon_auth.passkey where "userId"::text = ${u.ba}`.catch(() => {});
      await sql.query(`delete from neon_auth."twoFactor" where "userId"::text = $1`, [u.ba]).catch(() => {});
      await sql`delete from neon_auth."user" where id::text = ${u.ba}`.catch(() => {});
    }
    await sql.transaction([
      // The grace-period admin seat ends with the login.
      sql`delete from public.workspace_members where user_id = ${u.id} and role = ${SUNSET_MEMBER_ROLE}`,
      sql`delete from public.user_sessions where user_id = ${u.id}`,
      // Codes and legacy tokens are closed tables; the database clears them for this member (db/0226).
      sql`select public.rout_auth_secrets_clear()`,
      sql`update public.users set email = ${`${u.id}@retired.invalid`}, is_disabled = true,
          account_status = 'retired', user_metadata = user_metadata - 'neon_auth_id', updated_at = now() where id = ${u.id}`,
    ]);
  }
}

async function slugTaken(slug: string): Promise<boolean> {
  const rows = (await sql`select public.rout_workspace_slug_taken(${slug}) as taken`) as { taken: boolean }[];
  return Boolean(rows[0]?.taken);
}

/** Chosen address when valid and free; else the old username; else that with a short suffix. */
async function pickSlug(chosen: string | null, username: string | null, name: string): Promise<string> {
  const candidates = [chosen, suggestedConversionSlug(username, name)].filter((c): c is string => Boolean(c && isValidWorkspaceSlug(c)));
  for (const c of candidates) if (!(await slugTaken(c))) return c;
  const base = (candidates[0] ?? "team").slice(0, 34);
  for (let i = 0; i < 5; i++) {
    const c = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (!(await slugTaken(c))) return c;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

/** Old username, verification, both Studio designs and the first verified domain of the converted account. */
async function readCarryOver(userId: string) {
  const [p, drafts, domains] = await Promise.all([
    sql`select username, coalesce(verified, false) as verified from public.profiles where id = ${userId}` as unknown as Promise<{ username: string | null; verified: boolean }[]>,
    sql`select space, payload, published_revision from public.profile_drafts where user_id = ${userId}`.catch(() => []) as unknown as Promise<{ space: string; payload: Record<string, unknown>; published_revision: number | string }[]>,
    sql`select domain from public.custom_domains where user_id = ${userId} and status = 'verified'
        order by is_default desc, verified_at asc limit 1`.catch(() => []) as unknown as Promise<{ domain: string }[]>,
  ]);
  const draft = (space: string): ConversionDraft | null => {
    const d = drafts.find((r) => r.space === space);
    return d && d.payload && typeof d.payload === "object" ? { payload: d.payload, published: Number(d.published_revision) > 0 } : null;
  };
  return {
    username: p[0]?.username ?? null,
    verified: Boolean(p[0]?.verified),
    drafts: { verified: draft("verified"), alias: draft("alias") },
    domain: domains[0]?.domain ?? null,
  };
}
