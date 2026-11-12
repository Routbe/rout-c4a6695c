/**
 * One-time sealing of legacy plaintext signing keys (RFC-001 F8).
 *
 * Run only after EVERY deployment that shares this database runs the sealed-key
 * code: older code can only read plaintext keys and would stop signing.
 *
 *   bun scripts/seal-signing-keys.ts --status   show key states (no key material)
 *   bun scripts/seal-signing-keys.ts            seal: new sealed key, legacy key retired + wiped
 *
 * Uses ROUT_PROVIDER_SIGNING_KEK from the environment (falls back to a KEK
 * derived from the auth secret, with a warning).
 */
import { sql } from "@/lib/neon";
import { sealLegacyKeys } from "@/lib/oauth/keys.server";

const rows = (await sql`
  select kid, created_at, retired_at, revoked_at,
         case when private_jwk_sealed is not null then 'sealed'
              when private_jwk is not null then 'legacy_plaintext'
              else 'none' end as storage
    from public.oauth_signing_keys order by created_at
`) as Record<string, unknown>[];
console.table(rows);

if (!process.argv.includes("--status")) {
  const result = await sealLegacyKeys();
  console.log(result.wiped ? `✓ sealed: ${result.wiped} legacy key(s) retired and wiped${result.rotated ? ", new sealed key active" : ""}` : "✓ nothing to seal");
}
