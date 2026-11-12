import { generateToken, hashToken } from "./token-hash.server";
import { requirePasskeyStepUp } from "./step-up-guard.server";
import { canonicalAppUrl } from "@/lib/app-url";

export async function requestPrimaryEmailChange(userId: string, newEmail: string) {
  await requirePasskeyStepUp(userId, "primary_email_change");
  const { runBatch, sql } = await import("@/lib/neon");
  const user = (await sql`select email from public.users where id=${userId} limit 1`)[0];
  if (!user || typeof user["email"] !== "string") throw new Error("Account niet gevonden.");
  const oldEmail = user["email"];
  if (oldEmail.toLowerCase() === newEmail.toLowerCase()) throw new Error("Kies een ander e-mailadres.");
  const confirm = generateToken(32), freeze = generateToken(32);
  const id = crypto.randomUUID();
  await runBatch([
    { query: "select id from public.users where id=$1 for update", params: [userId] },
    { query: `select public.rout_merge_assert(not exists(select 1 from public.account_email_changes where user_id=$1 and recovery_until>now()),'email_change_locked_48h')`, params: [userId] },
    { query: `select public.rout_merge_assert(not exists(select 1 from public.users where lower(email)=lower($1)),'email_taken')`, params: [newEmail] },
    { query: `insert into public.account_email_changes(id,user_id,old_email,new_email,confirm_token_hash,freeze_token_hash) values($1,$2,$3,$4,$5,$6)`, params: [id,userId,oldEmail,newEmail,await hashToken(confirm),await hashToken(freeze)] },
  ]);
  const origin = canonicalAppUrl();
  const { sendMail } = await import("@/emails/send.server");
  const freezeUrl = `${origin}/auth/freeze-account?token=${encodeURIComponent(freeze)}`;
  const confirmUrl = `${origin}/auth/confirm-email-change?token=${encodeURIComponent(confirm)}`;
  const warning = await sendMail({ to: oldEmail, subject: "ROUT: wijziging van je primaire e-mailadres aangevraagd", category: "email_change",
    html: `<p>Er is een wijziging van je primaire e-mailadres aangevraagd. Je oude adres blijft 48 uur beschikbaar voor noodherstel.</p><p><a href="${freezeUrl}">Niet door jou? Bevries deze wijziging</a></p>`,
    params: { TITLE: "E-mailadreswijziging aangevraagd", BODY: "Je oude adres blijft 48 uur beschikbaar voor noodherstel. Niet door jou aangevraagd? Bevries deze wijziging.", CTA: "Noodbevriezen", LINK: freezeUrl, MAGIC_LINK: freezeUrl, url: freezeUrl, link: freezeUrl }, tags: ["security:email-change"] });
  if (!warning.sent) {
    await sql`update public.account_email_changes set frozen_at=now() where id=${id}`;
    throw new Error("Waarschuwing kon niet worden bezorgd; de wijziging is geblokkeerd.");
  }
  await sql`update public.account_email_changes set warning_sent_at=now() where id=${id}`;
  const verification = await sendMail({ to: newEmail, subject: "ROUT: bevestig je nieuwe e-mailadres", category: "email_change",
    html: `<p><a href="${confirmUrl}">Bevestig je nieuwe e-mailadres</a></p>`,
    params: { TITLE: "Bevestig je nieuwe e-mailadres", BODY: "Bevestig je nieuwe adres met je ROUT-account en passkey.", CTA: "Bevestigen", LINK: confirmUrl, MAGIC_LINK: confirmUrl, url: confirmUrl, link: confirmUrl }, tags: ["security:email-confirm"] });
  if (!verification.sent) throw new Error("Bevestigingsmail kon niet worden bezorgd. Je oude adres blijft actief.");
  return { ok: true as const };
}

/** Possession of the old-address token authorizes a single emergency freeze, not sign-in. */
export async function freezeEmailChange(token: string) {
  const { runBatch, sql, withDbContext } = await import("@/lib/neon");
  const hash = await hashToken(token);
  // Read token owner before entering owner-scoped RLS; never trust a request-supplied user ID.
  const owner = (await sql`select public.email_freeze_owner(${hash}) as user_id`)[0];
  if (typeof owner?.["user_id"] !== "string") throw new Error("freeze_token_invalid");
  await withDbContext({ userId: owner["user_id"], workspaceId: null }, () => runBatch([
    { query: "select id from public.account_email_changes where freeze_token_hash=$1 for update", params: [hash] },
    { query: `select public.rout_merge_assert(exists(select 1 from public.account_email_changes where freeze_token_hash=$1 and recovery_until>now() and frozen_at is null),'freeze_token_invalid')`, params: [hash] },
    { query: `update public.account_email_changes set frozen_at=now() where freeze_token_hash=$1`, params: [hash] },
    { query: `update public.users u set email=c.old_email,email_confirmed_at=now(),is_disabled=true,updated_at=now() from public.account_email_changes c where c.freeze_token_hash=$1 and u.id=c.user_id`, params: [hash] },
    { query: `update public.profiles p set email=c.old_email,status=case when p.status in ('active','frozen') then 'frozen' else p.status end from public.account_email_changes c where c.freeze_token_hash=$1 and p.id=c.user_id`, params: [hash] },
    { query: `update neon_auth."user" b set email=c.old_email,"emailVerified"=true from public.account_email_changes c join public.users u on u.id=c.user_id where c.freeze_token_hash=$1 and b.id::text=coalesce(u.auth_user_id::text,u.user_metadata->>'neon_auth_id')`, params: [hash] },
    { query: `delete from neon_auth.session s using public.users u,public.account_email_changes c where c.freeze_token_hash=$1 and u.id=c.user_id and s."userId"::text=coalesce(u.auth_user_id::text,u.user_metadata->>'neon_auth_id')`, params: [hash] },
    { query: `update public.oauth_access_tokens set revoked_at=now() where user_id in(select user_id from public.account_email_changes where freeze_token_hash=$1)`, params: [hash] },
    { query: `update public.oauth_refresh_tokens set revoked_at=now() where user_id in(select user_id from public.account_email_changes where freeze_token_hash=$1)`, params: [hash] },
  ]));
  return { ok: true as const };
}

export async function confirmPrimaryEmailChange(userId: string, token: string) {
  await requirePasskeyStepUp(userId, "primary_email_change");
  const { runBatch } = await import("@/lib/neon");
  const hash = await hashToken(token);
  await runBatch([
    { query: "select id from public.account_email_changes where user_id=$1 and confirm_token_hash=$2 for update", params: [userId,hash] },
    { query: `select public.rout_merge_assert(exists(select 1 from public.account_email_changes where user_id=$1 and confirm_token_hash=$2 and confirmed_at is null and frozen_at is null and warning_sent_at is not null and recovery_until>now()),'email_confirmation_invalid')`, params: [userId,hash] },
    { query: `update public.users u set email=c.new_email,email_confirmed_at=now(),updated_at=now() from public.account_email_changes c where c.user_id=$1 and c.confirm_token_hash=$2 and u.id=c.user_id`, params: [userId,hash] },
    { query: `update public.profiles p set email=c.new_email,updated_at=now() from public.account_email_changes c where c.user_id=$1 and c.confirm_token_hash=$2 and p.id=c.user_id`, params: [userId,hash] },
    { query: `update neon_auth."user" b set email=c.new_email,"emailVerified"=true from public.account_email_changes c join public.users u on u.id=c.user_id where c.user_id=$1 and c.confirm_token_hash=$2 and b.id::text=coalesce(u.auth_user_id::text,u.user_metadata->>'neon_auth_id')`, params: [userId,hash] },
    { query: `update public.account_email_changes set confirmed_at=now() where user_id=$1 and confirm_token_hash=$2`, params: [userId,hash] },
  ]);
  return { ok: true as const };
}