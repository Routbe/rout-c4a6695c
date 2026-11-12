/** Reviewed Neon tables without cascading owner FKs. Never derive SQL identifiers from requests. */
export const PURGE_OWNER_TABLES = [
  "app_email_assignments", "oauth_auth_codes", "oauth_consents", "oauth_step_up_codes", "oauth_step_up_challenges",
  "oauth_email_deliveries", "oauth_email_forwarding_rules", "phone_otp_codes", "security_codes",
  "psp_credentials", "tip_settings", "user_phone_numbers", "user_custom_badges",
  "identity_link_events", "business_verifications", "influencer_requests", "badge_claim_redemptions",
  "subdomain_root_claims", "security_audit_logs", "invoice_deliveries",
] as const;

/** Statements execute in one transaction; the locked due-request guard must run first. */
export function accountPurgeStatements(userId: string, authId: string) {
  const params = [userId];
  return [
    { query: `select user_id from public.account_deletions where user_id = $1
        and cancelled_at is null and completed_at is null and purge_after <= now() for update`, params },
    { query: `select 1 / case when exists (select 1 from public.account_deletions where user_id = $1
        and cancelled_at is null and completed_at is null and purge_after <= now()) then 1 else 0 end as due`, params },
    { query: `select set_config('rout.purge_user_id', $1, true)`, params },
    { query: `delete from public.profile_subscribers where owner_user_id = $1`, params },
    { query: `delete from public.onboarding_drafts where lower(email) in (select lower(email) from public.users where id = $1)`, params },
    ...PURGE_OWNER_TABLES.map((table) => ({ query: `delete from public.${table} where user_id = $1`, params })),
    { query: `delete from public.merged_auth_account_archive where primary_user_id = $1`, params },
    { query: `delete from public.webhook_endpoints where owner_user_id = $1`, params },
    { query: `delete from public.oauth_clients where owner_user_id = $1 and workspace_id is null`, params },
    { query: `update public.oauth_clients set owner_user_id = null where owner_user_id = $1`, params },
    { query: `update public.approved_handles set user_id = null where user_id = $1`, params },
    { query: `update public.custom_badges set owner_user_id = null where owner_user_id = $1`, params },
    { query: `delete from public.sepa_review_queue where user_id = $1`, params },
    { query: `delete from public.admin_bootstrap_tokens where consumed_by = $1`, params },
    ...["passkey", "twoFactor", "session", "account"].map((table) => ({
      query: `delete from neon_auth."${table}" where "userId"::text = $1`, params: [authId],
    })),
    { query: `delete from neon_auth.verification where identifier in (select email from neon_auth."user" where id::text = $1)`, params: [authId] },
    { query: `delete from neon_auth."user" where id::text = $1`, params: [authId] },
    { query: `delete from public.users where id = $1`, params },
    { query: `delete from public.account_deletions where user_id = $1`, params },
  ];
}