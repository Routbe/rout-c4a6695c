import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

export const getMyIdentityStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { getIdentityStatus, diditSuccessCount, providerConfigured } = await import("./identity.server");
    const { diditAvailable } = await import("./identity-rules");
    const status = await getIdentityStatus(context.userId);
    const count = await diditSuccessCount().catch(() => 0);
    const { sql } = await import("@/lib/neon");
    const pioneer = (await sql`select coalesce(is_early_believer, false) or coalesce(is_paid, false) as p
      from public.profiles where id = ${context.userId} limit 1`.catch(() => [])) as { p: boolean }[];
    return {
      ...status,
      /** Paid the legacy €3.99 verification: shown as Pioneer, must still verify identity. */
      isPioneer: Boolean(pioneer[0]?.p),
      wConfigured: providerConfigured("w_identity"),
      diditConfigured: providerConfigured("didit"),
      diditAvailable: diditAvailable(count),
    };
  });

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Start een verificatie en geef de URL terug waar de gebruiker heen moet. */
export const startIdentityVerification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d) => z.object({ provider: z.enum(["w_identity", "didit"]), origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; url: string } | { ok: false; reason: string }> => {
    const id = await import("./identity.server");
    const { diditAvailable } = await import("./identity-rules");
    if (!id.providerConfigured(data.provider)) return { ok: false, reason: "not_configured" };
    const { verificationDecision } = await import("./identity-tiers");
    if (verificationDecision(await id.getIdentityStatus(context.userId), data.provider) === "reject") {
      return { ok: false, reason: "already_verified" };
    }
    const { trustedOrigin } = await import("@/lib/safe-redirect");
    // Client-supplied origin: only our own domains (dev hosts outside production) may receive callbacks.
    const origin = trustedOrigin(data.origin, { allowDev: process.env["VERCEL_ENV"] !== "production" }) ?? "https://rout.be";

    if (data.provider === "w_identity") {
      const issuer = process.env["W_IDENTITY_ISSUER"]!.replace(/\/$/, "");
      const disco = (await (await fetch(`${issuer}/.well-known/openid-configuration`)).json()) as { authorization_endpoint: string };
      const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
      const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
      const state = await id.createSession(context.userId, "w_identity", verifier);
      const url = new URL(disco.authorization_endpoint);
      url.search = new URLSearchParams({
        response_type: "code",
        client_id: process.env["W_IDENTITY_CLIENT_ID"]!,
        redirect_uri: `${origin}/api/public/identity/w-callback`,
        scope: "openid profile",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }).toString();
      return { ok: true, url: url.toString() };
    }

    if (!diditAvailable(await id.diditSuccessCount())) return { ok: false, reason: "limit_reached" };
    const state = await id.createSession(context.userId, "didit", null);
    const res = await fetch("https://verification.didit.me/v2/session/", {
      method: "POST",
      headers: { "x-api-key": process.env["DIDIT_API_KEY"]!, "content-type": "application/json" },
      body: JSON.stringify({
        workflow_id: process.env["DIDIT_WORKFLOW_ID"],
        vendor_data: state,
        callback: `${origin}/settings?identity=pending`,
      }),
    });
    if (!res.ok) {
      console.error(`[identity] Didit session failed [${res.status}]: ${await res.text()}`);
      return { ok: false, reason: "provider_error" };
    }
    const body = (await res.json()) as { url?: string };
    return body.url ? { ok: true, url: body.url } : { ok: false, reason: "provider_error" };
  });
