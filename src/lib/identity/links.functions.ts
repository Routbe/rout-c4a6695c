import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

const RELME_ERRORS: Record<string, string> = {
  invalid_profile_url: "Gebruik een volledig https-adres van je profielpagina.",
  invalid_profile_host: "Dit adres is niet publiek bereikbaar.",
  relme_fetch_failed: "We konden die pagina niet openen.",
  relme_missing: "Op die pagina staat nog geen rel=\"me\"-link naar je ROUT-profiel.",
  identity_owned_elsewhere: "Deze identiteit is al aan een ander account gekoppeld.",
};

async function consumeStepUp(userId: string, code: string) {
  const { consumeSecurityCode } = await import("@/lib/security-code.server");
  if (!(await consumeSecurityCode(userId, "identity_link", code))) {
    throw new Error("De beveiligingscode klopt niet of is verlopen.");
  }
}

export const listMyIdentityLinks = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { listLinks } = await import("./links.server");
    return listLinks(context.userId);
  });

/** Links a website / fediverse profile through a rel="me" back-link. Requires a fresh e-mail code. */
export const linkRelMeIdentity = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ url: z.string().min(8).max(500), code: z.string().regex(/^\d{6}$/) }).strict().parse(d),
  )
  .handler(async ({ data, context }) => {
    await consumeStepUp(context.userId, data.code);
    const { sql } = await import("@/lib/neon");
    const { siteOrigin } = await import("@/lib/site-mail.server");
    const rows = (await sql`select username as handle from public.profiles where id = ${context.userId} and username is not null limit 1`) as { handle: string }[];
    const handle = rows[0]?.handle;
    if (!handle) throw new Error("Kies eerst een ROUT-handle.");
    const origin = siteOrigin();
    const targets = [`${origin}/${handle}`, `${origin}/@${handle}`, `${origin}/u/${handle}`];
    try {
      const { validateRelMeProof } = await import("./proofs/relme.server");
      const proof = await validateRelMeProof(data.url, targets);
      const { addLink } = await import("./links.server");
      const { link } = await addLink({ userId: context.userId, provider: "website", proof, stepUpMethod: "email_code", stepUpAt: new Date(), request: getRequest() });
      return link;
    } catch (error) {
      const key = error instanceof Error ? error.message : "";
      throw new Error(RELME_ERRORS[key] ?? "Koppelen is niet gelukt.");
    }
  });

/** Turning a link into a login method needs a fresh code; turning it off never does. */
export const setIdentityLinkLogin = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean(), code: z.string().regex(/^\d{6}$/).optional() }).strict().parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.enabled) {
      if (!data.code) throw new Error("Bevestig eerst met een beveiligingscode.");
      await consumeStepUp(context.userId, data.code);
    }
    const { setLoginEnabled } = await import("./links.server");
    return { ok: await setLoginEnabled(context.userId, data.id, data.enabled, getRequest()) };
  });

export const revokeIdentityLink = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).strict().parse(d))
  .handler(async ({ data, context }) => {
    const { revokeLink } = await import("./links.server");
    return { ok: await revokeLink(context.userId, data.id, getRequest()) };
  });

/** Public: shows what an emailed revoke link points at (read-only). */
export const describeIdentityRevoke = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(40).max(200) }).strict().parse(d))
  .handler(async ({ data }) => {
    const { describeRevokeToken } = await import("./links.server");
    const link = await describeRevokeToken(data.token);
    return link ? { label: link.displayHandle ?? link.issuer, status: link.status } : null;
  });

/** Public: the token itself is the authorization (HMAC over the link id). */
export const confirmIdentityRevoke = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(40).max(200) }).strict().parse(d))
  .handler(async ({ data }) => {
    const { revokeByToken } = await import("./links.server");
    return { ok: await revokeByToken(data.token, getRequest()) };
  });
