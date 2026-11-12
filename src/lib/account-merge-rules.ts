/**
 * Pure rules for the sovereign account merge (no I/O).
 *
 * Every public table that owns rows by `user_id` / `profile_id` must appear in
 * MERGE_TABLES with a reviewed strategy; a test fails when a new table is not
 * listed, so nothing is ever moved by guesswork.
 *
 *  - reassign             move all rows of the secondary account to the primary.
 *  - dedupe_keep_primary  rows that collide with a primary row on `keys` are
 *                         dropped (the primary wins), the rest is moved.
 *  - drop                 short-lived / per-login rows: deleted for the secondary.
 *  - skip                 never mutated. If the secondary owns any row the merge
 *                         is refused (deleting the account would cascade them).
 *  - retain               append-only logs without FK to the account: untouched.
 */

export type MergeStrategy = "reassign" | "dedupe_keep_primary" | "drop" | "skip" | "retain";
export type MergeSide = "primary" | "secondary";
export type MergeTableRule = {
  column: "user_id" | "profile_id";
  strategy: MergeStrategy;
  /** dedupe keys as SQL expressions over alias `X` (e.g. "lower(X.handle)"); [] = one row per account. */
  keys?: string[];
};

const r = (strategy: MergeStrategy, keys?: string[], column: "user_id" | "profile_id" = "user_id"): MergeTableRule =>
  keys ? { column, strategy, keys } : { column, strategy };
const one = (column: "user_id" | "profile_id" = "user_id") => r("dedupe_keep_primary", [], column);

export const MERGE_TABLES: Readonly<Record<string, MergeTableRule>> = {
  // Identity, money and legal records: immutable, a merge never touches them.
  identity_verifications: r("skip"),
  verified_identities: r("skip"),
  identity_links: r("skip"),
  wallets: r("skip"),
  wallet_transactions: r("skip"),
  psp_credentials: r("skip"),
  verification_payments: r("skip"),
  business_verifications: r("skip"),
  account_deletions: r("skip"),
  sepa_review_queue: r("skip"),
  // Parental consent (0174): a parent's approval belongs to the account it was
  // granted for. The FK cascades on delete, so a merge is refused instead of
  // silently moving or dropping a consent record.
  parent_authorizations: r("skip"),
  // Omni ingestion and live-presence rows (0185-0190) were added after the merge
  // manifest was reviewed: until a move strategy is reviewed, a secondary
  // account that owns any of them blocks the merge instead of losing data.
  ephemeral_statuses: r("skip"),
  presence_broadcast_jobs: r("skip"),
  omni_ingest_tokens: r("skip"),
  omni_jobs: r("skip"),
  omni_matrix_items: r("skip"),
  social_grid_items: r("skip"),
  // Wrapped E2EE data keys only open the secondary's own ciphertext: never moved or dropped.
  e2ee_key_wraps: r("skip"),
  // Card/issuer records must not silently transfer ownership across accounts.
  card_designs: r("skip"),
  card_freezes: r("skip"),
  factory_card_inventory: r("skip"),
  physical_keys: r("skip"),
  wallet_passes: r("skip"),
  oidc_subjects: r("skip"),
  // Recovery vault (0209) seals the secondary's own master key; card generations
  // (0212) are the card replacement counter. Never moved or silently dropped.
  recovery_vaults: r("skip"),
  recovery_attempts: r("skip"),
  rout_card_generations: r("skip"),

  // Append-only audit trails without FK: history stays as written.
  security_audit_logs: r("retain"),
  identity_link_events: r("retain"),
  // Chronos agent audit (0168): hash-chained, no FK to users — history stays as written.
  agent_audit_logs: r("retain"),
  physical_key_events: r("retain"),

  user_ledger_keys: r("skip"),
  user_encrypted_audit_logs: r("skip"),
  account_email_changes: r("skip"),
  app_issued_credentials: r("skip"),
  user_connected_apps_visibility: r("skip"),
  // Per-login / short-lived rows.
  user_sessions: r("drop"),
  security_codes: r("drop"),
  oauth_auth_codes: r("drop"),
  oauth_step_up_codes: r("drop"),
  oauth_step_up_challenges: r("drop"),
  oauth_access_tokens: r("drop"),
  oauth_refresh_tokens: r("drop"),
  phone_otp_codes: r("drop"),
  auth_tokens: r("drop"),
  profile_drafts: r("drop"),
  identity_verification_sessions: r("drop"),
  forwarding_confirmation_sends: r("drop"),
  availability_cache: r("drop"),
  availability_jobs: r("drop"),
  alias_sync_jobs: r("drop"),
  // One row per account: the primary's row wins.
  alias_profiles: one(),
  ambient_weather_locations: one(),
  nfc_waitlist: one(),
  pro_waitlist: one(),
  profile_ingest_tokens: one(),
  tip_settings: one(),
  user_calendar_feeds: one(),
  user_custom_presence: one(),
  user_music_status: one(),
  user_phone_numbers: one(),
  user_snapchat: one(),
  user_verified_claims: one(),
  // Keyed uniqueness: the primary's row wins on the same key.
  admin_permissions: r("dedupe_keep_primary", ["X.permission"]),
  app_email_assignments: r("dedupe_keep_primary", ["X.client_id"]),
  approved_handles: r("dedupe_keep_primary", ["lower(X.handle)"]),
  badge_claim_redemptions: r("dedupe_keep_primary", ["X.link_id"]),
  booking_event_type_hosts: r("dedupe_keep_primary", ["X.event_type_id"]),
  booking_event_types: r("dedupe_keep_primary", ["X.slug"]),
  bunq_oauth_tokens: r("dedupe_keep_primary", ["X.environment"]),
  oauth_consents: r("dedupe_keep_primary", ["X.client_id"]),
  oauth_email_forwarding_rules: r("dedupe_keep_primary", ["X.client_id"]),
  identity_relays: r("dedupe_keep_primary", ["X.connected_app_id"]),
  identity_relay_merge_archive: r("reassign"),
  reserved_brand_releases: r("dedupe_keep_primary", ["X.term"]),
  social_follow_links: r("dedupe_keep_primary", ["X.network", "X.remote_actor", "X.direction"]),
  user_badges: r("dedupe_keep_primary", ["X.badge_id"]),
  user_custom_badges: r("dedupe_keep_primary", ["X.badge_id"]),
  user_feature_blocks: r("dedupe_keep_primary", ["X.feature"]),
  user_integration_links: r("dedupe_keep_primary", ["X.provider"]),
  user_integrations: r("dedupe_keep_primary", ["X.provider"]),
  user_presence_connections: r("dedupe_keep_primary", ["X.provider"]),
  user_roles: r("dedupe_keep_primary", ["X.role"]),
  workspace_members: r("dedupe_keep_primary", ["X.workspace_id"]),
  social_links: r("dedupe_keep_primary", ["X.platform"], "profile_id"),
  social_block_settings: r("dedupe_keep_primary", ["X.platform", "lower(X.handle)"], "profile_id"),
  // Plain ownership: moved as-is.
  analytics_events: r("reassign", undefined, "profile_id"),
  booking_requests: r("reassign", undefined, "profile_id"),
  links: r("reassign", undefined, "profile_id"),
  api_keys: r("reassign"),
  rout_calendars: r("reassign"),
  avatar_objects: r("reassign"),
  badge_events: r("reassign"),
  community_reviews: r("reassign"),
  connected_calendars: r("reassign"),
  custom_domains: r("reassign"),
  domain_claims: r("reassign"),
  email_aliases: r("reassign"),
  feedback_forms: r("reassign"),
  gallery_objects: r("reassign"),
  identity_disclosure_logs: r("skip"),
  influencer_requests: r("reassign"),
  invoice_deliveries: r("reassign"),
  notifications: r("reassign"),
  oauth_email_deliveries: r("reassign"),
  profile_design_templates: r("reassign"),
  profile_events: r("reassign"),
  public_activity: r("reassign"),
  saved_qrs: r("reassign"),
  security_events: r("reassign"),
  shared_files: r("reassign"),
  subdomain_root_claims: r("reassign"),
  tracked_qrs: r("reassign"),
  user_assets: r("reassign"),
  user_identities: r("reassign"),
  user_linked_accounts: r("reassign"),
  availability_overrides: r("reassign"),
  availability_rules: r("reassign"),
};

/** Strict choice parsing: anything but exactly "primary" | "secondary" is refused. */
export function parseMergeSide(value: unknown): MergeSide {
  if (value === "primary" || value === "secondary") return value;
  throw new Error("invalid_merge_choice");
}

export type MergeStatement = { query: string; params: unknown[] };

const IDENT = /^[a-z_][a-z0-9_]*$/;
function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`unsafe identifier: ${name}`);
  return `"${name}"`;
}

/** Raise inside the transaction (db/0140) so the whole batch rolls back. */
export function assertStatement(condition: string, reason: string, params: unknown[]): MergeStatement {
  return { query: `select public.rout_merge_assert((${condition}), $${params.length + 1})`, params: [...params, reason] };
}

/** SQL for one table; $1 = primary id, $2 = secondary id. */
export function tableStatements(table: string, rule: MergeTableRule, primaryId: string, secondaryId: string): MergeStatement[] {
  const t = `public.${ident(table)}`;
  const c = ident(rule.column);
  const p = [primaryId, secondaryId];
  switch (rule.strategy) {
    case "retain":
      return [];
    case "skip":
      return [assertStatement(`not exists (select 1 from ${t} where ${c} = $2)`, `merge_blocked:${table}`, p)];
    case "drop":
      return [{ query: `delete from ${t} where ${c} = $1`, params: [secondaryId] }];
    case "reassign":
      return [{ query: `update ${t} set ${c} = $1 where ${c} = $2`, params: p }];
    case "dedupe_keep_primary": {
      const keys = rule.keys ?? [];
      const match = keys.map((k) => `${k.replace(/X\./g, "p.")} = ${k.replace(/X\./g, "s.")}`).join(" and ");
      const del = `delete from ${t} s where s.${c} = $2 and exists (select 1 from ${t} p where p.${c} = $1${match ? ` and ${match}` : ""})`;
      return [
        { query: del, params: p },
        { query: `update ${t} set ${c} = $1 where ${c} = $2`, params: p },
      ];
    }
  }
}

/** All table statements in a stable order: skip-asserts first so a blocked merge fails before any write. */
export function transferStatements(primaryId: string, secondaryId: string): MergeStatement[] {
  if (!primaryId || !secondaryId || primaryId === secondaryId) throw new Error("same_account");
  const order: MergeStrategy[] = ["skip", "drop", "dedupe_keep_primary", "reassign", "retain"];
  const entries = Object.entries(MERGE_TABLES).sort(
    ([a, ra], [b, rb]) => order.indexOf(ra.strategy) - order.indexOf(rb.strategy) || a.localeCompare(b),
  );
  return entries.flatMap(([table, rule]) => tableStatements(table, rule, primaryId, secondaryId));
}

/** Maps a database error from the merge transaction to a user-facing reason. */
export function mergeFailureReason(error: unknown): "blocked" | "invalid_or_expired" | "failed" {
  const msg = String((error as Error)?.message ?? "");
  if (msg.includes("merge_blocked:")) return "blocked";
  if (msg.includes("merge_ticket_not_claimable")) return "invalid_or_expired";
  return "failed";
}

export const MERGE_FAILURE_LIMIT = 5;
/** Fail closed: an unknown failure count (null) blocks the attempt. */
export function mergeAttemptAllowed(failures: number | null): boolean {
  return failures !== null && failures < MERGE_FAILURE_LIMIT;
}
