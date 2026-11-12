import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { normalizeBadgeWebsite } from "./badge-editor-rules";

/** Super Admin: eigen badges beheren. Elke call controleert de admin-rol server-side. */
async function guard(userId: string) {
  const { assertAdminRole } = await import("./admin.server");
  await assertAdminRole(userId);
  const { enforceRateLimit } = await import("./rate-limit.server");
  enforceRateLimit(`custom-badges:${userId}`, 120, 60_000);
}

const imageUrl = z.string().url().max(600).nullable().optional();
const opt = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => (v ? v : null));
const details = {
  name: z.string().trim().min(2).max(60),
  description: opt(200),
  imageUrl: imageUrl.transform((v) => v ?? null),
  kind: z.enum(["crest", "emblem", "award", "partner"]).default("crest"),
  motto: opt(80),
  story: opt(1000),
  issuerName: opt(80),
  issuerUrl: z.preprocess((v) => normalizeBadgeWebsite(v), z.string().url().max(300).nullable()),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional().or(z.literal("")).transform((v) => (v ? v : null)),
};

export const adminListCustomBadges = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await guard(context.userId);
    const { listCustomBadges } = await import("./custom-badges.server");
    return listCustomBadges();
  });

export const adminCreateCustomBadge = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object(details).parse(d),
  )
  .handler(async ({ data, context }) => {
    await guard(context.userId);
    const { createCustomBadge } = await import("./custom-badges.server");
    return createCustomBadge({ ...data, adminId: context.userId });
  });

export const adminUpdateCustomBadge = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), ...details }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await guard(context.userId);
    const { updateCustomBadge } = await import("./custom-badges.server");
    const { id, ...rest } = data;
    return updateCustomBadge(id, rest);
  });

export const adminDeleteCustomBadge = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await guard(context.userId);
    const { deleteCustomBadge } = await import("./custom-badges.server");
    return deleteCustomBadge(data.id);
  });

/** Upload van een badge-afbeelding: Scaleway Object Storage (publiek leesbaar), URL gaat naar Neon. */
export const adminUploadBadgeImage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ base64: z.string().min(16).max(2_800_000) }).parse(d))
  .handler(async ({ data, context }) => {
    await guard(context.userId);
    const s = await import("@/lib/storage/s3.server");
    const bytes = s.base64ToBytes(data.base64);
    // Bewaar de originele bytes: geen canvas, JPEG-conversie of achtergrond.
    const svg = new TextDecoder().decode(bytes).trim();
    const safeSvg = /^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(svg)
      && !/<(?:script|foreignObject|iframe|object|embed|style)\b|<!DOCTYPE|<!ENTITY|\bon[a-z]+\s*=|javascript:|data:|url\s*\(/i.test(svg)
      && !/\b(?:href|src)\s*=\s*["'](?!#)/i.test(svg);
    const real = s.sniffType(bytes) ?? (safeSvg ? "image/svg+xml" : null);
    if (!real || real !== "image/svg+xml" && !(s.IMAGE_TYPES as readonly string[]).includes(real)) return { ok: false as const, message: "Gebruik PNG, SVG, JPG of WebP." };
    const key = `badges/custom/${crypto.randomUUID()}.${real === "image/svg+xml" ? "svg" : s.extFor(real)}`;
    if (!s.storageConfigured("internal")) return { ok: false as const, message: "Opslag is niet ingesteld (S3_* variabelen ontbreken)." };
    await s.putObject("internal", key, bytes, { contentType: real, publicRead: true });
    return { ok: true as const, url: s.publicUrl("internal", key) };
  });

export const adminListBadgeHolders = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ badgeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await guard(context.userId);
    const { listBadgeHolders } = await import("./custom-badges.server");
    return listBadgeHolders(data.badgeId);
  });

export const adminFindUsers = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ query: z.string().max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    await guard(context.userId);
    const { findUsersByHandle } = await import("./custom-badges.server");
    return findUsersByHandle(data.query);
  });

export const adminUserCustomBadges = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await guard(context.userId);
    const { badgesForUser } = await import("./custom-badges.server");
    return badgesForUser(data.userId);
  });

export const adminSetCustomBadge = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), badgeId: z.string().uuid(), granted: z.boolean(), reason: opt(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await guard(context.userId);
    const m = await import("./custom-badges.server");
    return data.granted
      ? m.grantCustomBadge(data.userId, data.badgeId, context.userId, data.reason ?? null)
      : m.revokeCustomBadge(data.userId, data.badgeId);
  });

/** Publiek: eigen badges op een profiel. */
export const getPublicCustomBadges = createServerFn({ method: "GET" })
  .inputValidator((d: { handle: string }) => z.object({ handle: z.string().max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { publicBadgesForHandle } = await import("./custom-badges.server");
    return publicBadgesForHandle(data.handle);
  });
