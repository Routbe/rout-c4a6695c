/**
 * Wallet pass generator for profiles (business card) and events (ticket).
 * Reads public data only (same visibility rules as the public pages). Without
 * certificates it returns an unsigned demo payload instead of failing.
 */
import { canonicalAppUrl } from "@/lib/app-url";
import {
  appleWalletConfig,
  applePassJson,
  appleCardPassJson,
  googleCardSaveClaims,
  googleSaveClaims,
  googleWalletConfig,
  type WalletKind,
  type WalletSubject,
} from "./wallet-pass";

export type PassResult =
  | { kind: "pkpass"; bytes: Uint8Array; filename: string }
  | { kind: "redirect"; url: string }
  | { kind: "demo"; wallet: "apple" | "google"; payload: unknown }
  | { kind: "not_found" };

/**
 * Canonical origin for pass content and assets. The request's `url.origin` is
 * untrusted (Host header), so passes always point at the configured site
 * origin — `NEXT_PUBLIC_APP_URL` via canonicalAppUrl(), falling back to
 * https://rout.be — never at whatever host the request arrived on.
 */
function walletOrigin(): string {
  const configured = process.env["WALLET_ASSET_ORIGIN"]?.trim();
  if (configured && /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(configured)) return configured;
  return canonicalAppUrl();
}

export async function loadWalletSubject(kind: WalletKind, id: string, origin: string): Promise<WalletSubject | null> {
  const base = walletOrigin();
  void origin; // untrusted request origin — never used for pass content
  if (kind === "profile") {
    const { readPublicProfile } = await import("@/lib/studio-profile.server");
    const p = (await readPublicProfile(id)) as Record<string, unknown> | null;
    if (!p) return null;
    const handle = String(p["username"] ?? id);
    return { kind, id: handle, title: String(p["display_name"] || `@${handle}`), subtitle: `@${handle}`, url: `${base}/${encodeURIComponent(handle)}` };
  }
  const { readPublicEvents } = await import("@/lib/event-engine.server");
  const e = (await readPublicEvents(id, null, null))[0];
  if (!e) return null;
  const when = new Date(e.startsAt).toLocaleString("nl-BE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Brussels" });
  // A barcode is an access claim. ROUT has no per-holder ticket record for
  // events, so a public event pass is always informational: it never carries a
  // barcode and never reads booking data on behalf of an anonymous caller.
  return { kind, id: e.slug, title: e.title, subtitle: when, url: `${base}/event/${encodeURIComponent(e.slug)}`, startsAt: e.startsAt, venue: e.venue || null, accessClaim: false };
}

export async function generatePass(kind: WalletKind, id: string, wallet: "apple" | "google", origin: string, space?: "root" | "alias"): Promise<PassResult> {
  // Profiles are ROUT Cards: one shared payload for Google, Apple and the 3D card.
  if (kind === "profile") return generateCardPass(id, wallet, space);
  const subject = await loadWalletSubject(kind, id, origin);
  const assetOrigin = walletOrigin();
  if (!subject) return { kind: "not_found" };
  const env = process.env as Record<string, string | undefined>;

  if (wallet === "google") {
    const cfg = googleWalletConfig(env);
    if (!cfg) return { kind: "demo", wallet, payload: googleSaveClaims(subject, { issuerId: "DEMO", serviceAccountEmail: "demo@example.invalid", origins: [assetOrigin] }) };
    const { googleSaveUrl } = await import("./google-wallet.server");
    return { kind: "redirect", url: await googleSaveUrl(subject, assetOrigin, cfg) };
  }

  const cfg = appleWalletConfig(env);
  if (!cfg) return { kind: "demo", wallet, payload: applePassJson(subject, { passTypeId: "pass.demo.rout", teamId: "DEMO" }) };
  const img = async (path: string) => new Uint8Array(await (await fetch(`${assetOrigin}${path}`)).arrayBuffer());
  const [icon, icon2x, logo] = await Promise.all([img("/favicon.png"), img("/icon-192.png"), img("/apple-touch-icon.png")]);
  const { buildPkpass } = await import("./apple-wallet.server");
  const bytes = await buildPkpass(subject, { "icon.png": icon, "icon@2x.png": icon2x, "logo.png": logo }, cfg);
  return { kind: "pkpass", bytes, filename: `rout-${subject.kind}.pkpass` };
}

async function walletImages(assetOrigin: string) {
  const img = async (path: string) => new Uint8Array(await (await fetch(`${assetOrigin}${path}`)).arrayBuffer());
  const [icon, icon2x, logo] = await Promise.all([img("/favicon.png"), img("/icon-192.png"), img("/apple-touch-icon.png")]);
  return { "icon.png": icon, "icon@2x.png": icon2x, "logo.png": logo };
}

/** ROUT Card for a profile (handle or user id). */
export async function generateCardPass(userIdOrHandle: string, wallet: "apple" | "google", space?: "root" | "alias"): Promise<PassResult> {
  const { generateWalletPayload, walletOrigin: origin } = await import("./wallet-payload.server");
  const card = await generateWalletPayload(userIdOrHandle, { space });
  if (!card) return { kind: "not_found" };
  const base = origin();
  const env = process.env as Record<string, string | undefined>;
  if (wallet === "google") {
    const cfg = googleWalletConfig(env);
    if (!cfg) return { kind: "demo", wallet, payload: googleCardSaveClaims(card, { issuerId: "DEMO", serviceAccountEmail: "demo@example.invalid", origins: [base] }) };
    const { googleCardSave } = await import("./google-wallet.server");
    return { kind: "redirect", url: (await googleCardSave(card, base, cfg)).saveUrl };
  }
  const cfg = appleWalletConfig(env);
  if (!cfg) return { kind: "demo", wallet, payload: appleCardPassJson(card, { passTypeId: "pass.demo.rout", teamId: "DEMO" }) };
  const { signPkpass } = await import("./apple-wallet.server");
  const bytes = await signPkpass(appleCardPassJson(card, { passTypeId: cfg.passTypeId, teamId: cfg.teamId }), await walletImages(base), cfg);
  return { kind: "pkpass", bytes, filename: `rout-${card.space === "alias" ? "u-" : ""}${card.handle}.pkpass` };
}
