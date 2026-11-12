-- Append-only successor: 0145 is already the encrypted ledger migration.
-- IMPORTANT: the active connector must separately be replaced with a reviewed
-- non-owner runtime connection. This migration does not make neondb_owner safe.
ALTER ROLE rout_app NOBYPASSRLS;

ALTER TABLE public.mastodon_app_registrations ENABLE ROW LEVEL SECURITY;
-- Instance-wide OAuth client secrets are server-only, not tenant profile data.
-- No permissive rout_app policy: deny by default until a separate, reviewed
-- server-service access path exists. Never grant tenant users all cache rows.
REVOKE ALL ON public.mastodon_app_registrations FROM PUBLIC;

-- Replace the eight drifting explicit role grants with reviewed privileges.
REVOKE ALL ON public.account_deletion_audit, public.account_deletions,
  public.identity_disclosure_logs, public.mastodon_app_registrations,
  public.merged_auth_account_archive, public.security_audit_checkpoints,
  public.verified_identities, public.webhook_deliveries FROM rout_app;
GRANT SELECT, INSERT ON public.account_deletion_audit TO rout_app;
-- DELETE is intentional: the atomic due purge removes the identifying request.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_deletions TO rout_app;
GRANT SELECT, INSERT ON public.identity_disclosure_logs TO rout_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mastodon_app_registrations TO rout_app;
-- DELETE is intentional: primary-user archive rows have no cascading FK.
GRANT SELECT, INSERT, DELETE ON public.merged_auth_account_archive TO rout_app;
GRANT SELECT, INSERT, UPDATE ON public.verified_identities TO rout_app;
GRANT SELECT, INSERT, UPDATE ON public.webhook_deliveries TO rout_app;
-- security_audit_checkpoints remains denied to the tenant runtime.

-- Only the matching primary user with a due, uncancelled request can purge
-- archive rows as rout_app. Authenticated request context remains mandatory.
CREATE POLICY rout_archive_due_purge ON public.merged_auth_account_archive
  FOR DELETE TO rout_app USING (
    primary_user_id = public.rout_current_user_id()
    AND EXISTS (SELECT 1 FROM public.account_deletions d
      WHERE d.user_id = primary_user_id AND d.cancelled_at IS NULL
        AND d.completed_at IS NULL AND d.purge_after <= now())
  );