import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { optionalAuth, requireAuth } from "@/lib/auth/middleware";

/** Owner-only Google claim. Client account IDs and arbitrary class IDs are never accepted. */
export const createWalletPass = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ handle: z.string().trim().min(1).max(100).regex(/^@?[\w.-]+$/), space: z.enum(["root", "alias"]).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { isPlatformFeatureEnabled } = await import("@/lib/platform-features.server");
    if (!(await isPlatformFeatureEnabled("wallet"))) return { ok: false as const, error: "feature_disabled" };
    const { generateWalletPayload, walletOrigin } = await import("./wallet-payload.server");
    const own = await generateWalletPayload(context.userId, { space: data.space, allowAccountId: true });
    const { canClaimWalletCard } = await import("./wallet-claim");
    if (!own || !canClaimWalletCard(own, data.handle, data.space)) return { ok: false as const, error: "forbidden" };
    // Wallet cards are for verified members only: a verified root profile is the gate for every card.
    const { isVerifiedMember } = await import("./wallet-verified.server");
    if (own.space === "alias" && !(await isVerifiedMember(context.userId))) return { ok: false as const, error: "not_verified" };
    const { googleWalletConfig } = await import("./wallet-pass");
    const cfg = googleWalletConfig(process.env as Record<string, string | undefined>);
    if (!cfg) return { ok: false as const, error: "wallet_not_configured" };
    try {
      const { googleCardSave } = await import("./google-wallet.server");
      // Google ignores the JWT object when the pass is already saved: push the current design first.
      const { syncGoogleCardQuietly } = await import("./google-wallet-sync.server");
      const sync = await syncGoogleCardQuietly(own, walletOrigin(), cfg);
      return { ok: true as const, ...(await googleCardSave(own, walletOrigin(), cfg)), updatedExisting: sync.object === "updated" };
    } catch {
      console.error("[wallet] owner claim signing failed");
      return { ok: false as const, error: "wallet_issue_failed" };
    }
  });

/**
 * Owner-only vault overview for the three compartmentalised passes: the member's
 * own handles plus booleans for what can be issued. Never returns config values.
 */
export const getMyWalletVault = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const env = process.env as Record<string, string | undefined>;
    const { walletStatus } = await import("./wallet-pass");
    const { smartTapConfig, appleNfcConfig } = await import("./wallet-key");
    const { isPlatformFeatureEnabled } = await import("@/lib/platform-features.server");
    const { generateWalletPayload } = await import("./wallet-payload.server");
    const on = await isPlatformFeatureEnabled("wallet");
    const [root, alias] = await Promise.all([
      generateWalletPayload(context.userId, { space: "root", allowAccountId: true }).catch(() => null),
      generateWalletPayload(context.userId, { space: "alias", allowAccountId: true }).catch(() => null),
    ]);
    const status = on ? walletStatus(env) : { apple: false, google: false };
    const secret = (env["WALLET_ID_SECRET"]?.length ?? 0) >= 32;
    // The root payload only resolves for a verified profile; without it no card is issued.
    const verified = root?.space === "root";
    const { memberHasTwoFactor } = await import("./card-owner.server");
    const twoFactor = await memberHasTwoFactor(context.userId);
    return {
      verified,
      twoFactor,
      root: verified ? root.handle : null,
      alias: verified && alias?.space === "alias" ? alias.handle : null,
      google: status.google,
      apple: status.apple,
      // Google: the rotating QR works without Smart Tap; NFC joins once Google approves it.
      keyGoogle: verified && status.google && secret,
      keyGoogleNfc: !!smartTapConfig(env),
      keyApple: verified && status.apple && secret && !!appleNfcConfig(env),
    };
  });

/** Owner-only Google save link for one of the three passes; the server resolves the member's own card. */
export const createVaultPass = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ passType: z.enum(["PUBLIC_PROFILE", "STEALTH", "SMART_TAP_KEY"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const env = process.env as Record<string, string | undefined>;
    const { isPlatformFeatureEnabled } = await import("@/lib/platform-features.server");
    if (!(await isPlatformFeatureEnabled("wallet"))) return { ok: false as const, error: "feature_disabled" };
    const { googleWalletConfig, googleLogoUrl } = await import("./wallet-pass");
    const cfg = googleWalletConfig(env);
    if (!cfg) return { ok: false as const, error: "wallet_not_configured" };
    const { walletOrigin, generateWalletPayload } = await import("./wallet-payload.server");
    const { signGoogleSaveJwt, googleSaveLink } = await import("./google-wallet.server");
    const { isVerifiedMember } = await import("./wallet-verified.server");
    if (!(await isVerifiedMember(context.userId))) return { ok: false as const, error: "not_verified" };
    try {
      if (data.passType === "SMART_TAP_KEY") {
        // The private ROUT card: 2FA on, card active and unlocked by a fresh verification.
        const { memberHasTwoFactor, myRootCard } = await import("./card-owner.server");
        if (!(await memberHasTwoFactor(context.userId))) return { ok: false as const, error: "two_factor_required" };
        const mine = await myRootCard(context.userId);
        if (!mine) return { ok: false as const, error: "no_profile" };
        if (mine.state !== "active") return { ok: false as const, error: "card_inactive" };
        const { cardUnlockedUntil } = await import("./card-unlock.server");
        if (!(await cardUnlockedUntil(context.userId))) return { ok: false as const, error: "locked" };
        const { smartTapConfig, googleKeySaveClaims } = await import("./wallet-key");
        const { walletKeyPayload } = await import("./wallet-key.server");
        const key = await walletKeyPayload(context.userId, env["WALLET_ID_SECRET"], Date.now(), mine.generation);
        if (!key) return { ok: false as const, error: "key_not_configured" };
        const origin = walletOrigin();
        const claims = googleKeySaveClaims(key, { issuerId: cfg.issuerId, serviceAccountEmail: cfg.serviceAccountEmail, origins: [origin], logoUrl: googleLogoUrl({ url: origin }), smartTap: smartTapConfig(env), manageUrl: `${origin}/wallet` });
        return { ok: true as const, saveUrl: googleSaveLink(await signGoogleSaveJwt(claims, cfg)) };
      }
      const space = data.passType === "STEALTH" ? "alias" : "root";
      const own = await generateWalletPayload(context.userId, { space, allowAccountId: true });
      if (!own || own.space !== space) return { ok: false as const, error: space === "alias" ? "no_alias" : "no_profile" };
      const { googleCardSave } = await import("./google-wallet.server");
      const { syncGoogleCardQuietly } = await import("./google-wallet-sync.server");
      await syncGoogleCardQuietly(own, walletOrigin(), cfg);
      return { ok: true as const, saveUrl: (await googleCardSave(own, walletOrigin(), cfg)).saveUrl };
    } catch {
      console.error("[wallet] vault pass signing failed");
      return { ok: false as const, error: "wallet_issue_failed" };
    }
  });

const frontTarget = z.object({ target: z.enum(["root", "alias"]) });

/** Owner only: where the big front QR of the ROUT card points (public profile or alias profile). */
export const getMyCardFront = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { sql } = await import("@/lib/neon");
    const { generateWalletPayload } = await import("./wallet-payload.server");
    const [rows, alias] = await Promise.all([
      sql`select display_prefs->>'cardFrontTarget' as target from public.profiles where id = ${context.userId} limit 1`,
      generateWalletPayload(context.userId, { space: "alias", allowAccountId: true }).catch(() => null),
    ]);
    const aliasHandle = alias?.space === "alias" ? alias.handle : null;
    const stored = rows[0]?.target === "alias" ? "alias" : "root";
    return { target: (stored === "alias" && aliasHandle ? "alias" : "root") as "root" | "alias", alias: aliasHandle };
  });

export const setMyCardFront = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => frontTarget.parse(d))
  .handler(async ({ data, context }) => {
    const { sql } = await import("@/lib/neon");
    await sql`update public.profiles set display_prefs = jsonb_set(coalesce(display_prefs, '{}'::jsonb), '{cardFrontTarget}', to_jsonb(${data.target}::text), true) where id = ${context.userId}`;
    return { ok: true as const };
  });

/** Public: which wallets can issue passes right now (booleans only, never config values). */
export const getWalletStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { walletStatus } = await import("./wallet-pass");
  const { isPlatformFeatureEnabled } = await import("@/lib/platform-features.server");
  // An admin pause switches both wallets off; the 3D card and vCard stay available.
  if (!(await isPlatformFeatureEnabled("wallet"))) return { apple: false, google: false };
  return walletStatus(process.env as Record<string, string | undefined>);
});

/** Public: the ROUT Card payload for the 3D card (public profile data only). */
export const getWalletCard = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ handle: z.string().trim().min(1).max(100).regex(/^@?[\w.-]+$/), space: z.enum(["root", "alias"]).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { generateWalletPayload, walletOrigin } = await import("./wallet-payload.server");
    const card = await generateWalletPayload(data.handle, { space: data.space });
    if (!card) return null;
    const base = walletOrigin();
    // Same-origin path for drawing the photo on a canvas without CORS taint.
    const avatarPath = card.heroImageUrl?.startsWith(base) ? card.heroImageUrl.slice(base.length) : null;
    const { readCardDesign } = await import("./card-freeze.server");
    const { applyCardDesign } = await import("./card-design");
    const styled = applyCardDesign(card, await readCardDesign(card.serial));
    const { pickCardView } = await import("./card-liveness");
    // Allowlist, not a spread: only public card fields ever leave the server here.
    const view = pickCardView({ ...styled.card, avatarPath, materialId: styled.materialId as string | null });
    return view;
  });

const cardRef = z.object({ handle: z.string().trim().min(1).max(100).regex(/^@?[\w.-]+$/), space: z.enum(["root", "alias"]).optional() });

/**
 * Liveness for the 3D card. Everyone gets the per-window shader seed; only the
 * signed-in owner of this exact card gets the rotating live code.
 */
export const getCardLiveness = createServerFn({ method: "POST" })
  .middleware([optionalAuth])
  .inputValidator((d: unknown) => cardRef.parse(d))
  .handler(async ({ data, context }) => {
    const { generateWalletPayload } = await import("./wallet-payload.server");
    const { livenessKey } = await import("./card-liveness.server");
    const { liveCode, liveSeed, liveWindow, LIVE_WINDOW_S } = await import("./card-liveness");
    const card = await generateWalletPayload(data.handle, { space: data.space });
    if (!card) return null;
    const key = await livenessKey();
    const now = Date.now();
    const w = liveWindow(now);
    let owner = false;
    if (context.userId) {
      const own = await generateWalletPayload(context.userId, { space: card.space, allowAccountId: true });
      owner = own?.serial === card.serial;
    }
    const { cardStatus } = await import("./card-freeze.server");
    const status = await cardStatus(card.serial);
    const live = owner && status === "active";
    let unlocked = false;
    if (live && context.userId) {
      const { cardUnlockedUntil } = await import("./card-unlock.server");
      unlocked = !!(await cardUnlockedUntil(context.userId));
    }
    // Age tier is told to the owner only; visitors never learn a member is a minor.
    const { isMinorUser } = await import("@/lib/minor-safety.server");
    const minor = owner && context.userId ? await isMinorUser(context.userId).catch(() => true) : false;
    // Front QR digits (rout.be/<handle>/<6 digits>, new every 10 min): owner of an active root card only.
    const { frontCode, frontWindow, FRONT_WINDOW_S } = await import("./card-front-code");
    const fw = frontWindow(now);
    const front = live && card.space === "root" ? await frontCode(key, card.serial, fw) : null;
    return {
      frontCode: front,
      frontExpiresAt: (fw + 1) * FRONT_WINDOW_S * 1000,
      owner,
      tier: (minor ? "minor" : "sovereign") as "minor" | "sovereign",
      frozen: status !== "active",
      blocked: status === "blocked",
      locked: owner && !unlocked,
      freezeAvailable: status !== "unavailable",
      window: w,
      expiresAt: (w + 1) * LIVE_WINDOW_S * 1000,
      serverNow: now,
      seed: await liveSeed(key, card.serial, w),
      code: live && unlocked ? await liveCode(key, card.serial, w) : null,
    };
  });

/**
 * Owner only: a fresh secure QR (60 s, single-use nonce). The client asks
 * every 45 s, so the back of the card always shows a live token.
 */
export const getSecureCardToken = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ space: z.enum(["root", "alias"]).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { generateWalletPayload, walletOrigin } = await import("./wallet-payload.server");
    const own = await generateWalletPayload(context.userId, { space: data.space, allowAccountId: true });
    if (!own) return null;
    const { validateCardActive } = await import("./card-freeze.server");
    if (!(await validateCardActive(own.serial))) return { frozen: true as const };
    // Private side: only inside the short window opened by a fresh verification.
    const { cardUnlockedUntil } = await import("./card-unlock.server");
    if (!(await cardUnlockedUntil(context.userId))) return { frozen: false as const, locked: true as const };
    const { livenessKey } = await import("./card-liveness.server");
    const { signSecureToken, accessPayload } = await import("./card-token");
    const now = Date.now();
    const { cardTokenTag } = await import("./card-verify.server");
    const { token, payload } = await signSecureToken(await livenessKey(), { handle: own.handle, space: own.space, now, card: await cardTokenTag(own.serial) });
    return { frozen: false as const, locked: false as const, url: accessPayload(token), iat: payload.iat, exp: payload.exp, serverNow: now };
  });

/**
 * Check a secure QR from the back of a card. Zero trust: a scan is only a pointer.
 * The scanner must be signed in and confirm with a real second factor right now
 * (passkey, authenticator app or SMS) before anything is checked or shown.
 */
export const verifySecureCardToken = createServerFn({ method: "POST" })
  .middleware([optionalAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().trim().min(20).max(600) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!context.userId) return { status: "sign_in_required" as const };
    const { getRequest } = await import("@tanstack/react-start/server");
    const { hitRateLimit, clientIp } = await import("@/lib/rate-limit-db.server");
    const [ipLimit, userLimit] = await Promise.all([
      hitRateLimit("card-secure-verify", clientIp(getRequest()), { limit: 20, windowSec: 300 }, { failClosed: true }),
      hitRateLimit("card-secure-verify-user", context.userId, { limit: 20, windowSec: 300 }, { failClosed: true }),
    ]);
    if (!ipLimit.ok || !userLimit.ok) return { status: "limited" as const };
    const { memberHasTwoFactor } = await import("./card-owner.server");
    if (!(await memberHasTwoFactor(context.userId))) return { status: "two_factor_required" as const };
    const { ensureStepUpProof, consumeStepUp, StepUpRequiredError } = await import("@/lib/auth/step-up.server");
    try {
      await ensureStepUpProof(context.userId, "card_scan");
    } catch (err) {
      if (err instanceof StepUpRequiredError) return { status: "step_up_required" as const };
      throw err;
    }
    await consumeStepUp();
    const { verifySecureCardTokenCore } = await import("./card-verify.server");
    return verifySecureCardTokenCore(data.token);
  });

/** Public: check a code a card holder shows you. Rate limited per visitor. */
export const verifyCardLiveCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => cardRef.extend({ code: z.string().trim().min(4).max(12) }).parse(d))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { hitRateLimit, clientIp } = await import("@/lib/rate-limit-db.server");
    const limit = await hitRateLimit("card-live-verify", clientIp(getRequest()), { limit: 10, windowSec: 300 }, { failClosed: true });
    if (!limit.ok) return { valid: false, limited: true };
    const { generateWalletPayload } = await import("./wallet-payload.server");
    const { livenessKey } = await import("./card-liveness.server");
    const { verifyLiveCode } = await import("./card-liveness");
    const card = await generateWalletPayload(data.handle, { space: data.space });
    if (!card) return { valid: false, limited: false };
    const { validateCardActive } = await import("./card-freeze.server");
    if (!(await validateCardActive(card.serial))) return { valid: false, limited: false };
    return { valid: await verifyLiveCode(await livenessKey(), card.serial, data.code, Date.now()), limited: false };
  });

/**
 * Owner only: freeze (instant, one tap) or unfreeze (fresh verification + 2FA).
 * The root card and its wallet key freeze together; a blocked card never thaws.
 */
export const setMyCardFrozen = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ frozen: z.boolean(), space: z.enum(["root", "alias"]).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { generateWalletPayload } = await import("./wallet-payload.server");
    const own = await generateWalletPayload(context.userId, { space: data.space, allowAccountId: true });
    if (!own) throw Object.assign(new Error("No card"), { statusCode: 404 });
    const { myRootCard, memberHasTwoFactor } = await import("./card-owner.server");
    const mine = own.space === "root" ? await myRootCard(context.userId) : null;
    if (mine?.state === "blocked") return { frozen: true, blocked: true };
    // Freezing and thawing both need 2FA and a fresh, single-use verification (zero-trust rule).
    if (!(await memberHasTwoFactor(context.userId))) throw new Error("two_factor_required");
    const { ensureStepUpSession, consumeStepUp } = await import("@/lib/auth/step-up.server");
    await ensureStepUpSession(context.userId, "card_lifecycle");
    await consumeStepUp();
    const { setCardFrozen } = await import("./card-freeze.server");
    await setCardFrozen(own.serial, context.userId, data.frozen, mine?.keySerial ? [mine.keySerial] : []);
    if (mine?.keySerial) {
      const { setGoogleKeyPassState } = await import("./google-wallet-sync.server");
      await setGoogleKeyPassState([mine.keySerial], data.frozen ? "INACTIVE" : "ACTIVE", process.env as Record<string, string | undefined>);
    }
    if (data.frozen) {
      const { closeCardUnlock } = await import("./card-unlock.server");
      await closeCardUnlock(context.userId);
    }
    const { recordSecurityEvent } = await import("@/lib/audit-log.server");
    void recordSecurityEvent({ eventType: data.frozen ? "card.frozen" : "card.unfrozen", userId: context.userId, payload: { space: own.space } });
    return { frozen: data.frozen, blocked: false };
  });

/** Owner only: the private ROUT card's security facts (never codes or key material). */
export const getMyCardSecurity = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { myRootCard, memberHasTwoFactor } = await import("./card-owner.server");
    const { cardUnlockedUntil } = await import("./card-unlock.server");
    const [mine, twoFactor, unlockedUntil] = await Promise.all([myRootCard(context.userId), memberHasTwoFactor(context.userId), cardUnlockedUntil(context.userId)]);
    const { walletStatus } = await import("./wallet-pass");
    const { isPlatformFeatureEnabled } = await import("@/lib/platform-features.server");
    const status = (await isPlatformFeatureEnabled("wallet")) ? walletStatus(process.env as Record<string, string | undefined>) : { apple: false, google: false };
    // The private card needs its own server key on top of the Google issuer; profile cards do not.
    const wallet = { ...status, key: status.google && (process.env["WALLET_ID_SECRET"]?.length ?? 0) >= 32 };
    return {
      hasCard: !!mine,
      handle: mine?.card.handle ?? null,
      cardNumber: mine?.card.sovereignId ?? null,
      state: mine?.state ?? ("unavailable" as const),
      replaced: (mine?.generation ?? 0) > 0,
      twoFactor,
      unlockedUntil: mine?.state === "active" && twoFactor ? unlockedUntil : null,
      serverNow: Date.now(),
      wallet,
    };
  });

/** Owner only: opens the 5-minute window for the private side after a fresh verification. */
export const unlockMyCard = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { myRootCard, memberHasTwoFactor } = await import("./card-owner.server");
    if (!(await memberHasTwoFactor(context.userId))) return { ok: false as const, error: "two_factor_required" as const };
    const mine = await myRootCard(context.userId);
    if (!mine) return { ok: false as const, error: "no_card" as const };
    if (mine.state !== "active") return { ok: false as const, error: "card_inactive" as const };
    const { ensureStepUpProof, consumeStepUp } = await import("@/lib/auth/step-up.server");
    // One verification, one viewing: the proof is spent atomically, so the next viewing asks again.
    const proof = await ensureStepUpProof(context.userId, "card_reveal");
    await consumeStepUp();
    const { openCardUnlock } = await import("./card-unlock.server");
    // The window is tied to this card number and ends 2 minutes after the verification itself.
    return { ok: true as const, unlockedUntil: await openCardUnlock(context.userId, mine.card.serial, proof.verifiedAtSec), serverNow: Date.now() };
  });

/** Owner only: hides the private side again (on leave, tab switch or button). */
export const lockMyCard = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { closeCardUnlock } = await import("./card-unlock.server");
    await closeCardUnlock(context.userId);
    return { ok: true as const };
  });

/** Owner only: permanently block the private ROUT card (lost or stolen). Irreversible. */
export const blockMyCard = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ reason: z.enum(["lost", "stolen", "other"]) }).strict().parse(d))
  .handler(async ({ data, context }) => {
    const { myRootCard, memberHasTwoFactor } = await import("./card-owner.server");
    if (!(await memberHasTwoFactor(context.userId))) return { ok: false as const, error: "two_factor_required" as const };
    const mine = await myRootCard(context.userId);
    if (!mine) return { ok: false as const, error: "no_card" as const };
    if (mine.state === "blocked") return { ok: true as const };
    const { ensureStepUpSession, consumeStepUp } = await import("@/lib/auth/step-up.server");
    await ensureStepUpSession(context.userId, "card_lifecycle");
    await consumeStepUp();
    const { blockCard } = await import("./card-freeze.server");
    try {
      await blockCard(mine.card.serial, context.userId, data.reason, mine.keySerial ? [mine.keySerial] : []);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 503) return { ok: false as const, error: "unavailable" as const };
      throw err;
    }
    if (mine.keySerial) {
      const { setGoogleKeyPassState } = await import("./google-wallet-sync.server");
      await setGoogleKeyPassState([mine.keySerial], "INACTIVE", process.env as Record<string, string | undefined>);
    }
    const { closeCardUnlock } = await import("./card-unlock.server");
    await closeCardUnlock(context.userId);
    const { recordSecurityEvent } = await import("@/lib/audit-log.server");
    void recordSecurityEvent({ eventType: "card.blocked", userId: context.userId, payload: { reason: data.reason } });
    return { ok: true as const };
  });

/**
 * Owner only: replace the private ROUT card. The current number, wallet key and
 * linked physical keys are blocked for good; a new number and key are issued.
 */
export const replaceMyCard = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { myRootCard, memberHasTwoFactor } = await import("./card-owner.server");
    if (!(await memberHasTwoFactor(context.userId))) return { ok: false as const, error: "two_factor_required" as const };
    const mine = await myRootCard(context.userId);
    if (!mine) return { ok: false as const, error: "no_card" as const };
    const { ensureStepUpSession, consumeStepUp } = await import("@/lib/auth/step-up.server");
    await ensureStepUpSession(context.userId, "card_lifecycle");
    await consumeStepUp();
    const { replaceCardAtomically } = await import("./card-freeze.server");
    const { hitRateLimit } = await import("@/lib/rate-limit-db.server");
    const limit = await hitRateLimit("card-replace", context.userId, { limit: 3, windowSec: 24 * 3600 }, { failClosed: true });
    if (!limit.ok) return { ok: false as const, error: "rate_limited" as const };
    try {
      // Block old card + key, revoke physical keys and issue the next number in one transaction.
      const next = await replaceCardAtomically(mine.card.serial, context.userId, mine.generation, mine.keySerial ? [mine.keySerial] : []);
      if (next === null) return { ok: false as const, error: "busy" as const };
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 503) return { ok: false as const, error: "unavailable" as const };
      throw err;
    }
    if (mine.keySerial) {
      const { setGoogleKeyPassState } = await import("./google-wallet-sync.server");
      await setGoogleKeyPassState([mine.keySerial], "INACTIVE", process.env as Record<string, string | undefined>);
    }
    const { closeCardUnlock } = await import("./card-unlock.server");
    await closeCardUnlock(context.userId);
    const fresh = await myRootCard(context.userId);
    const { recordSecurityEvent } = await import("@/lib/audit-log.server");
    void recordSecurityEvent({ eventType: "card.replaced", userId: context.userId, payload: {} });
    return { ok: true as const, cardNumber: fresh?.card.sovereignId ?? null };
  });

const cmfInput = z.object({
  space: z.enum(["root", "alias"]).optional(),
  materialId: z.string().min(1).max(40),
  accentHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  displayName: z.string().trim().min(1).max(40),
  region: z.string().trim().max(40),
});

/** Owner only: validate (tier, contrast, privacy bot) and store the CMF production JSON. */
export const saveMyCardDesign = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => cmfInput.parse(d))
  .handler(async ({ data, context }) => {
    const { checkCardText } = await import("./card-privacy");
    const hit = checkCardText(data.displayName) ?? checkCardText(data.region);
    if (hit) return { ok: false as const, error: "privacy" as const, hit };
    const { isMinorUser } = await import("@/lib/minor-safety.server");
    const tier = (await isMinorUser(context.userId).catch(() => true)) ? "minor" : "sovereign";
    const { buildCmf } = await import("./card-cmf");
    const r = buildCmf(data, tier);
    if (!r.ok) return { ok: false as const, error: r.error };
    const { generateWalletPayload } = await import("./wallet-payload.server");
    const own = await generateWalletPayload(context.userId, { space: data.space, allowAccountId: true });
    if (!own) throw Object.assign(new Error("No card"), { statusCode: 404 });
    const { saveCardDesign } = await import("./card-freeze.server");
    try {
      await saveCardDesign(own.serial, context.userId, r.cmf);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 503) return { ok: false as const, error: "unavailable" as const };
      throw err;
    }
    return { ok: true as const, cmf: r.cmf };
  });

/** Owner only: the member's physical keys (cards, wearables). */
export const listMyPhysicalKeys = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const { listMyKeys } = await import("./card-freeze.server");
    return listMyKeys();
  });

/** Legacy registration is disabled: client tags must not supply factory keys. */
export const addMyPhysicalKey = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({
      space: z.enum(["root", "alias"]).optional(),
      label: z.string().trim().max(40).optional(),
      nfcUid: z.string().max(60).optional(),
      publicKey: z.string().max(200).optional(),
      keyAlg: z.enum(["Ed25519", "P-256"]).optional(),
    }).parse(d),
  )
  .handler(async () => ({ ok: false as const, error: "factory-only" as const }));

/** Owner only: pair a pre-provisioned card using a separate activation proof. */
export const pairMyPhysicalKey = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({
    hardwareId: z.string().uuid(),
    activationCode: z.string().trim().min(20).max(128).regex(/^[A-Za-z0-9_-]+$/),
    space: z.enum(["root", "alias"]).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { memberHasTwoFactor } = await import("./card-owner.server");
    if (!(await memberHasTwoFactor(context.userId))) return { ok: false as const, error: "two_factor_required" as const };
    const { cardUnlockedUntil } = await import("./card-unlock.server");
    if (!(await cardUnlockedUntil(context.userId))) return { ok: false as const, error: "locked" as const };
    const { generateWalletPayload } = await import("./wallet-payload.server");
    const own = await generateWalletPayload(context.userId, { space: data.space, allowAccountId: true });
    if (!own) return { ok: false as const, error: "card" as const };
    const { validateCardActive } = await import("./card-freeze.server");
    if (!(await validateCardActive(own.serial))) return { ok: false as const, error: "card" as const };
    const { pairFactoryKey } = await import("./card-freeze.server");
    const { sha256Hex } = await import("./hardware-crypto");
    try {
      const id = await pairFactoryKey(data.hardwareId, await sha256Hex(data.activationCode), own.serial);
      return id ? { ok: true as const, hardwareId: id } : { ok: false as const, error: "activation" as const };
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 503) return { ok: false as const, error: "unavailable" as const };
      throw err;
    }
  });

/** Owner only: activate, freeze or revoke one physical key. Revoked is final. */
export const setMyPhysicalKeyStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ hardwareId: z.string().uuid(), status: z.enum(["active", "frozen", "revoked"]) }).parse(d))
  .handler(async ({ data, context }) => {
    // Freezing/revoking a key is always instant; switching one back on needs the unlocked card.
    if (data.status === "active") {
      const { memberHasTwoFactor } = await import("./card-owner.server");
      const { cardUnlockedUntil } = await import("./card-unlock.server");
      if (!(await memberHasTwoFactor(context.userId)) || !(await cardUnlockedUntil(context.userId))) return { ok: false };
    }
    const { setMyKeyStatus } = await import("./card-freeze.server");
    return { ok: await setMyKeyStatus(data.hardwareId, data.status) };
  });

/** Owner-only: static public QR for the printed metal card. Never an auth credential. */
export const getPhysicalCardQr = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ space: z.enum(["root", "alias"]).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { generateWalletPayload, walletOrigin } = await import("./wallet-payload.server");
    const own = await generateWalletPayload(context.userId, { space: data.space, allowAccountId: true });
    if (!own) return null;
    const { livenessKey } = await import("./card-liveness.server");
    const { sealPublicCardId } = await import("./card-public-id");
    const id = await sealPublicCardId(await livenessKey(), context.userId, own.space);
    return { url: `${walletOrigin()}/v/${id}`, authenticates: false as const };
  });

/** Public: printed metal-card QR lookup. Identity display only; rate limited. */
export const lookupPhysicalCardFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ cardId: z.string().trim().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { hitRateLimit, clientIp } = await import("@/lib/rate-limit-db.server");
    const limit = await hitRateLimit("card-physical-lookup", clientIp(getRequest()), { limit: 60, windowSec: 300 }, { failClosed: true });
    if (!limit.ok) return { channel: "physical-public" as const, authenticates: false as const, status: "limited" as const };
    const { lookupPhysicalCard } = await import("./physical-card.server");
    return lookupPhysicalCard(data.cardId);
  });
