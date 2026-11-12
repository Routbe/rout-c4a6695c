import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";
import { claimsFromRow, type VerifiedClaims } from "@/lib/verified-claims";

/** The signed-in member's own verifiable claims (read-only; no app path writes them). */
export const getMyVerifiedClaims = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<VerifiedClaims> => {
    const { sql } = await import("@/lib/neon");
    const rows = (await sql`
      select is_verified_human, is_over_18, verification_provider::text as verification_provider,
             to_json(verified_at) #>> '{}' as verified_at
      from public.user_verified_claims where user_id = ${context.userId} limit 1`) as Record<string, unknown>[];
    return claimsFromRow(rows[0]);
  });
