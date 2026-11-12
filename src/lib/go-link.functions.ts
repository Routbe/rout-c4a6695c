import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { optionalAuth } from "@/lib/auth/middleware";
import { validatedRedirectTarget } from "./security/redirect-target";

/**
 * Signed /go app links: the QR generator asks the server to sign the
 * destinations, and /go only auto-redirects when the signature matches.
 * Unsigned or tampered links show a confirmation page instead.
 */
const target = z.string().trim().max(2048).optional();
const goSchema = z.object({ i: target, a: target, w: target });

function canonical(d: z.infer<typeof goSchema>): string {
  return `i=${d.i ?? ""}\na=${d.a ?? ""}\nw=${d.w ?? ""}`;
}

async function hmac(payload: string): Promise<string> {
  const { signValueRaw } = await import("./go-link.server");
  return signValueRaw(payload);
}

function isWebUrl(value?: string): boolean {
  if (!value) return true;
  try {
    return Boolean(validatedRedirectTarget(value));
  } catch {
    return false;
  }
}

export const signGoLink = createServerFn({ method: "POST" })
  .middleware([optionalAuth])
  .inputValidator((data: unknown) => goSchema.parse(data))
  .handler(async ({ data, context }) => {
    // Only signed-in members get auto-redirecting links; anonymous links show the confirmation page.
    if (!context.userId) return { sig: null };
    if (![data.i, data.a, data.w].every(isWebUrl)) return { sig: null };
    const { sql } = await import("./neon");
    const rows = await sql.query("select tier_1_real_human, tier_2_legal_identity from public.verified_identities where user_id=$1 limit 1", [context.userId]) as { tier_1_real_human: boolean; tier_2_legal_identity: boolean }[];
    if (!rows[0]?.tier_1_real_human && !rows[0]?.tier_2_legal_identity) return { sig: null };
    return { sig: await hmac(canonical(data)) };
  });

export const verifyGoLink = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => goSchema.extend({ s: z.string().max(200).optional() }).parse(data))
  .handler(async ({ data }) => {
    if (!data.s || ![data.i, data.a, data.w].every(isWebUrl)) return { valid: false };
    const expected = await hmac(canonical(data));
    return { valid: expected === data.s };
  });

export const resolveGoDestination = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => goSchema.extend({ to: target, s: z.string().max(200).optional(), selected: z.string().max(2048) }).parse(input))
  .handler(async ({ data }) => {
    if (![data.i, data.a, data.w, data.to, data.selected].every(isWebUrl)) return { destination: null, status: 400 };
    if (![data.i, data.a, data.w, data.to].includes(data.selected)) return { destination: null, status: 400 };
    let trusted = false;
    if (!data.to && data.s) { const expected = await hmac(canonical(data)); trusted = expected === data.s; }
    const { safeExternalRedirect } = await import("./security/safe-redirect.server");
    return { destination: await safeExternalRedirect(data.selected, trusted), status: 200 };
  });
