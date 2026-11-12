import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";

const settingsSchema = z.object({
  enabled: z.boolean(),
  iban: z.string().max(40),
  accountName: z.string().max(70),
  presetsCents: z.array(z.number().int().min(1).max(500_000)).max(6),
  allowCustom: z.boolean(),
  minCents: z.number().int().min(100).max(500_000),
  message: z.string().max(400),
  imageUrls: z.array(z.string().url().max(600)).max(6),
  methods: z.array(z.object({ id: z.enum(["transfer", "psp", "links"]), enabled: z.boolean() })).max(3),
  externalLinks: z.array(z.object({ kind: z.enum(["buymeacoffee", "kofi", "paypal", "bunq", "patreon", "liberapay"]), value: z.string().max(200) })).max(6),
  socialSource: z
    .object({ network: z.enum(["bluesky", "mastodon"]), handle: z.string().max(120), mode: z.enum(["latest", "picked"]), picked: z.array(z.string().max(600)).max(6) })
    .nullable(),
});

export const getMyTipSetup = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const m = await import("./tip-page.server");
    const eligibility = await m.tipEligibility(context.userId);
    if (!eligibility.ok) return { eligibility, settings: null, psp: [] as Awaited<ReturnType<typeof m.listPsp>> };
    const [settings, psp] = await Promise.all([m.readTipSettings(context.userId), m.listPsp(context.userId)]);
    return { eligibility, settings, psp };
  });

export const saveMyTipSettings = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => settingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { writeTipSettings } = await import("./tip-page.server");
    return writeTipSettings(context.userId, data);
  });

/** Upload van een (al in de browser bijgesneden) afbeelding voor de steunpagina. */
export const uploadTipImage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ base64: z.string().min(16).max(2_800_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertTipEligible } = await import("./tip-page.server");
    await assertTipEligible(context.userId);
    const s = await import("@/lib/storage/s3.server");
    const bytes = s.base64ToBytes(data.base64);
    const real = s.sniffType(bytes);
    if (!real || !["image/webp", "image/jpeg", "image/png"].includes(real)) return { ok: false as const, message: "Ongeldige afbeelding." };
    if (!s.storageConfigured("client")) return { ok: false as const, message: "Opslag is niet ingesteld." };
    const key = `users/${context.userId}/tip/${crypto.randomUUID()}.${s.extFor(real)}`;
    await s.putObject("client", key, bytes, { contentType: real, publicRead: true });
    return { ok: true as const, url: s.publicUrl("client", key) };
  });

const provider = z.enum(["stripe", "mollie"]);

export const saveMyPspKey = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ provider, secret: z.string().min(10).max(300), publishableKey: z.string().max(300).optional(), acceptDisclaimer: z.literal(true) }).parse(d))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    enforceRateLimit(`psp-key:${context.userId}`, 10, 60_000);
    const { savePsp } = await import("./tip-page.server");
    return savePsp(context.userId, data.provider, data.secret, data.publishableKey);
  });

export const deleteMyPspKey = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ provider }).parse(d))
  .handler(async ({ data, context }) => {
    const { deletePsp } = await import("./tip-page.server");
    return deletePsp(context.userId, data.provider);
  });

export const getPublicTipPage = createServerFn({ method: "GET" })
  .inputValidator((d: { handle: string }) => z.object({ handle: z.string().max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { readPublicTipPage } = await import("./tip-page.server");
    return readPublicTipPage(data.handle);
  });

export const startTipPayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        handle: z.string().max(80),
        amountCents: z.number().int().min(100).max(500_000),
        method: z.enum(["card", "bancontact", "wero"]),
        origin: z.string().url().max(300),
        altcha: z.string().max(4000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await (await import("@/lib/platform-features.server")).assertPlatformFeature("tips");
    const { assertHuman } = await import("./altcha.server");
    await assertHuman(data.altcha ?? null);
    const { getRequest } = await import("@tanstack/react-start/server");
    const { trustedCheckoutOrigin } = await import("./verification.server");
    const origin = trustedCheckoutOrigin(getRequest(), data.origin);
    const { startPspTip } = await import("./tip-page.server");
    return startPspTip({ handle: data.handle, amountCents: data.amountCents, method: data.method, origin });
  });

/** Sovereign Tip Jar: the EPC payload is built on the server from the creator's saved IBAN; no PSP involved. */
export const getTipJarQr = createServerFn({ method: "GET" })
  .inputValidator((d: { handle: string }) => z.object({ handle: z.string().max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { readPublicTipPage } = await import("./tip-page.server");
    const { buildEpcPayload } = await import("./epc-qr");
    const page = await readPublicTipPage(data.handle);
    if (!page) return null;
    const amountCents = Math.max(page.minCents, page.presetsCents[0] ?? 250);
    const reference = `Steun @${page.handle}`;
    const payload = buildEpcPayload({ beneficiary: page.accountName, iban: page.iban, amountCents, reference });
    return payload ? { handle: page.handle, accountName: page.accountName, amountCents, payload } : null;
  });

/**
 * Openbare foto's voor een publieke fooipagina. Bezoekers kiezen geen bron: de
 * server leest de Bluesky/Mastodon-bron die de maker zelf heeft opgeslagen.
 */
export const fetchTipSocialImages = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ handle: z.string().max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { readPublicTipPage } = await import("./tip-page.server");
    const page = await readPublicTipPage(data.handle);
    const src = page?.socialSource;
    if (!page || !src || src.mode !== "latest") return { ok: true as const, images: [] as { url: string; alt: string; postUrl: string }[], skipped: 0 };
    const { enforceRateLimit } = await import("./rate-limit.server");
    enforceRateLimit(`tip-social:page:${page.handle}`, 20, 60_000);
    const { fetchSocialImages } = await import("./tip-social.server");
    return fetchSocialImages(src.network, src.handle);
  });

/** Voorvertoning in het dashboard: alleen de ingelogde maker mag een willekeurige bron proberen. */
export const previewTipSocialImages = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ network: z.enum(["bluesky", "mastodon"]), handle: z.string().max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    enforceRateLimit(`tip-social:user:${context.userId}`, 20, 60_000);
    const { fetchSocialImages } = await import("./tip-social.server");
    return fetchSocialImages(data.network, data.handle);
  });
