import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";
import type { SocialLinkDTO } from "@/lib/social-verify";

/**
 * RPC-laag voor sociale links: toevoegen, verifiëren (bio-link), handmatig
 * verversen (max. 1x per 24 uur) en verwijderen.
 */

export const getSocialLinks = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { listSocialLinks } = await import("./social-verify.server");
    return (await listSocialLinks(context.userId)) as SocialLinkDTO[];
  });

export const saveSocialLink = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { platform: string; username: string }) => input)
  .handler(async ({ data, context }) => {
    const { upsertSocialLink } = await import("./social-verify.server");
    try {
      const link = await upsertSocialLink(context.userId, data.platform, data.username);
      return { ok: true as const, link, reason: null };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "save_failed";
      return { ok: false as const, link: null, reason };
    }
  });

export const removeSocialLink = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { deleteSocialLink } = await import("./social-verify.server");
    return deleteSocialLink(context.userId, data.id);
  });

/** Verifieert eigendom: staat `rout.be/<handle>` in de bio van het account? */
export const verifySocialOwnership = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { verifySocialLink } = await import("./social-verify.server");
    return verifySocialLink(context.userId, data.id, false);
  });

/** Handmatig verversen — strikt één keer per 24 uur per account. */
export const refreshSocialLink = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { verifySocialLink } = await import("./social-verify.server");
    return verifySocialLink(context.userId, data.id, true);
  });
