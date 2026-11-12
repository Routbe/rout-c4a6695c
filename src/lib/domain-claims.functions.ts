import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

const MESSAGES: Record<string, string> = {
  invalid_domain: "Dat is geen geldige domeinnaam.",
  private_suffix: "Adressen bij hostingdiensten (zoals github.io) kunnen geen handle claimen.",
  not_apex: "Gebruik het hoofddomein, zonder subdomein (bv. jouwnaam.be).",
  invalid_handle: "Dit domein levert geen geldige handle op.",
  domain_claimed: "Dit domein wordt al door een ander account geclaimd.",
  handle_claimed: "Deze handle is al via een ander domein geclaimd.",
  record_missing: "We vinden het TXT-record nog niet. DNS-wijzigingen kunnen tot een uur duren.",
  dns_claims_not_configured: "Domeinverificatie is nog niet geconfigureerd.",
  not_found: "Deze claim bestaat niet (meer).",
};

async function friendly<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const key = e instanceof Error ? e.message : "";
    throw new Error(MESSAGES[key] ?? "Dat lukte niet.");
  }
}

export const listMyDomainClaims = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => friendly(async () => (await import("./domain-claims.server")).listClaims(context.userId)));

export const startDomainClaim = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ domain: z.string().min(3).max(253) }).strict().parse(d))
  .handler(async ({ data, context }) => friendly(async () => (await import("./domain-claims.server")).startClaim(context.userId, data.domain)));

export const verifyDomainClaim = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).strict().parse(d))
  .handler(async ({ data, context }) => {
    const { hitRateLimit } = await import("@/lib/rate-limit-db.server");
    const limit = await hitRateLimit("dns-claim-verify", context.userId, { limit: 20, windowSec: 3600 });
    if (!limit.ok) throw new Error("Te veel controles. Probeer over een uur opnieuw.");
    return friendly(async () => (await import("./domain-claims.server")).verifyClaim(context.userId, data.id));
  });

export const releaseDomainClaim = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).strict().parse(d))
  .handler(async ({ data, context }) => {
    await (await import("./domain-claims.server")).releaseClaim(context.userId, data.id);
    return { ok: true as const };
  });
