/**
 * Wallet compartmentalisation: three separate passes per member (pure, browser-safe).
 *
 *  PUBLIC_PROFILE  root ROUT Card: QR to the public profile hub, no NFC.
 *  STEALTH         alias ROUT Card: QR to the private alias (/u/<handle>), no NFC.
 *  SMART_TAP_KEY   Sovereign Key: no static QR and no public profile data at all; an NFC
 *                  token for Google Smart Tap / Apple VAS readers, plus (Google only) a
 *                  QR that Google Wallet itself rotates every 60 s (TOTP). Apple cannot
 *                  rotate a barcode, so the Apple key stays NFC-only.
 *
 * The key pass never carries a handle, name, profile URL or card number, so a
 * photographed or shoulder-surfed key reveals nothing about the profile, and a
 * profile card never carries an NFC token.
 */
import { createLocalizedString } from "./wallet-i18n";
import type { GoogleCardClaims, GoogleLoyaltyClass, GoogleLoyaltyObject } from "./google-pass-types";

export type WalletPassType = "PUBLIC_PROFILE" | "STEALTH" | "SMART_TAP_KEY";
export const WALLET_PASS_TYPES: readonly WalletPassType[] = ["PUBLIC_PROFILE", "STEALTH", "SMART_TAP_KEY"];

/** Which profile namespace a QR pass shows; the key pass has none. */
export function passTypeSpace(type: WalletPassType): "root" | "alias" | null {
  return type === "PUBLIC_PROFILE" ? "root" : type === "STEALTH" ? "alias" : null;
}

/**
 * Only the key pass may transmit over NFC; only profile passes may show a fixed QR.
 * The key's only QR is the Google-rotated TOTP code (never on Apple, never fixed).
 */
export const PASS_TYPE_RULES: Record<WalletPassType, { qr: boolean; nfc: boolean; rotatingQr: boolean }> = {
  PUBLIC_PROFILE: { qr: true, nfc: false, rotatingQr: false },
  STEALTH: { qr: true, nfc: false, rotatingQr: false },
  SMART_TAP_KEY: { qr: false, nfc: true, rotatingQr: true },
};

/** Rotation period and length of the Google key's TOTP code. */
export const KEY_TOTP_PERIOD_MS = 60_000;
export const KEY_TOTP_DIGITS = 8;
/** QR text of the rotating key code: `rout:wk:<key id>:<8 digits>`; never a web URL. */
export const keyQrPattern = (keyId: string) => `rout:wk:${keyId}:{totp_value_0}`;

type Env = Record<string, string | undefined>;

/** Google Smart Tap needs a redemption issuer (with collector keys) approved by Google. */
export function smartTapConfig(env: Env): { redemptionIssuerId: string } | null {
  const id = env["GOOGLE_WALLET_SMART_TAP_ISSUER_ID"]?.trim() ?? "";
  return /^[0-9]{6,25}$/.test(id) ? { redemptionIssuerId: id } : null;
}

/** Apple VAS needs Apple's NFC pass entitlement and the reader's P-256 public key (base64 DER). */
export function appleNfcConfig(env: Env): { encryptionPublicKey: string } | null {
  const key = env["APPLE_WALLET_NFC_PUBLIC_KEY"]?.trim() ?? "";
  return /^[A-Za-z0-9+/]{80,200}={0,2}$/.test(key) ? { encryptionPublicKey: key } : null;
}

/** Server-derived key material; see wallet-key.server.ts. Unlinkable to the profile cards. */
export type WalletKeyPayload = {
  /** Object/serial suffix, keyed per member, never the account id or card number. */
  serial: string;
  /** NFC token: `rk1.<key id>.<issued>.<mac>`, re-issued on every save, ≤ 64 bytes for Apple VAS. */
  token: string;
  /** Last four characters of the key id, for the member to recognise their key. */
  label: string;
  /** Google rotating QR: key id plus the Base16 TOTP secret Google Wallet rotates with. */
  totp?: { keyId: string; secretHex: string };
};

export const KEY_TILE = "#0a0a0a";
const same = (value: string) => createLocalizedString({ nl: value, en: value, fr: value, de: value });
const text = (nl: string, en: string, fr: string, de: string) => createLocalizedString({ nl, en, fr, de });

export function googleKeyClass(issuerId: string, smartTap: { redemptionIssuerId: string } | null, logoUrl: string): GoogleLoyaltyClass {
  return {
    id: `${issuerId}.rout_sovereign_key`,
    issuerName: "ROUT",
    programName: "ROUT-kaart",
    programLogo: { sourceUri: { uri: logoUrl }, contentDescription: same("ROUT") },
    hexBackgroundColor: KEY_TILE,
    reviewStatus: "UNDER_REVIEW",
    localizedAccountNameLabel: text("Type", "Type", "Type", "Typ"),
    localizedAccountIdLabel: text("Sleutel", "Key", "Clé", "Schlüssel"),
    // NFC joins once Google approves Smart Tap; the rotating QR works without it.
    ...(smartTap ? { enableSmartTap: true, redemptionIssuers: [smartTap.redemptionIssuerId] } : {}),
    classTemplateInfo: { cardTemplateOverride: { cardRowTemplateInfos: [
      { oneItem: { item: { firstValue: { fields: [{ fieldPath: "object.accountName" }] } } } },
      { oneItem: { item: { firstValue: { fields: [{ fieldPath: "object.accountId" }] } } } },
    ] } },
  };
}

/** Key object: no fixed barcode, no handle, no profile link; NFC token plus a Google-rotated TOTP QR. */
export function googleKeyObject(key: WalletKeyPayload, issuerId: string, opts: { nfc?: boolean; manageUrl?: string } = { nfc: true }): GoogleLoyaltyObject {
  return {
    id: `${issuerId}.${key.serial}`,
    classId: `${issuerId}.rout_sovereign_key`,
    state: "ACTIVE",
    accountName: opts.nfc !== false ? "Privé · NFC + QR" : "Privé · roterende QR",
    accountId: `•••• ${key.label}`,
    ...(opts.nfc !== false ? { smartTapRedemptionValue: key.token } : {}),
    ...(opts.manageUrl ? { linksModuleData: { uris: [{ id: "manage", uri: opts.manageUrl, localizedDescription: text("Kaart beheren, bevriezen of vervangen", "Manage, freeze or replace card", "Gérer, geler ou remplacer la carte", "Karte verwalten, sperren oder ersetzen") }] } } : {}),
    ...(key.totp ? { rotatingBarcode: {
      type: "QR_CODE" as const,
      valuePattern: keyQrPattern(key.totp.keyId),
      totpDetails: { periodMillis: String(KEY_TOTP_PERIOD_MS), algorithm: "TOTP_SHA1" as const, parameters: [{ key: key.totp.secretHex, valueLength: KEY_TOTP_DIGITS }] },
    } } : {}),
    textModulesData: [
      { id: "key", localizedHeader: text("Betaalsleutel", "Payment key", "Clé de paiement", "Bezahlschlüssel"), localizedBody: text(
        "Betaal met NFC of laat de QR scannen. De QR vernieuwt elke minuut en werkt maar één keer; er staan geen profielgegevens op.",
        "Pay with NFC or let the QR be scanned. The QR renews every minute and works only once; it holds no profile data.",
        "Payez par NFC ou faites scanner le QR. Le QR se renouvelle chaque minute et ne fonctionne qu’une fois ; il ne contient aucune donnée de profil.",
        "Bezahle per NFC oder lass den QR scannen. Der QR erneuert sich jede Minute und funktioniert nur einmal; er enthält keine Profildaten.",
      ) },
      { id: "separate", localizedHeader: text("Gescheiden van je profiel", "Separate from your profile", "Séparé de votre profil", "Getrennt von deinem Profil"), localizedBody: text(
        "Je openbare ROUT Card en deze sleutel zijn bewust twee passen. Wie je profielkaart ziet of scant, krijgt nooit je sleutel.",
        "Your public ROUT Card and this key are deliberately two passes. Anyone who sees or scans your profile card never gets your key.",
        "Votre ROUT Card publique et cette clé sont volontairement deux pass. Voir ou scanner votre carte de profil ne donne jamais votre clé.",
        "Deine öffentliche ROUT Card und dieser Schlüssel sind bewusst zwei Pässe. Wer deine Profilkarte sieht oder scannt, erhält nie deinen Schlüssel.",
      ) },
    ],
  };
}

export function googleKeySaveClaims(key: WalletKeyPayload, cfg: { issuerId: string; serviceAccountEmail: string; origins: string[]; logoUrl: string; smartTap: { redemptionIssuerId: string } | null; manageUrl?: string }): GoogleCardClaims {
  return {
    iss: cfg.serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    origins: cfg.origins,
    payload: { loyaltyClasses: [googleKeyClass(cfg.issuerId, cfg.smartTap, cfg.logoUrl)], loyaltyObjects: [googleKeyObject(key, cfg.issuerId, { nfc: !!cfg.smartTap, manageUrl: cfg.manageUrl })] },
  };
}

/** Apple pass.json for the key: VAS `nfc` dictionary, deliberately no `barcodes`. */
export function appleKeyPassJson(key: WalletKeyPayload, cfg: { passTypeId: string; teamId: string }, nfc: { encryptionPublicKey: string }) {
  return {
    formatVersion: 1,
    passTypeIdentifier: cfg.passTypeId,
    teamIdentifier: cfg.teamId,
    serialNumber: key.serial,
    organizationName: "ROUT",
    description: "ROUT Sovereign Key",
    logoText: "ROUT",
    foregroundColor: "rgb(255, 255, 255)",
    backgroundColor: "rgb(10, 10, 10)",
    labelColor: "rgb(160, 160, 160)",
    nfc: { message: key.token, encryptionPublicKey: nfc.encryptionPublicKey, requiresAuthentication: true },
    storeCard: {
      primaryFields: [{ key: "type", label: "SOVEREIGN KEY", value: "NFC" }],
      secondaryFields: [{ key: "key", label: "SLEUTEL", value: `•••• ${key.label}` }],
      backFields: [{ key: "about", label: "Over", value: "Geen QR-code en geen profielgegevens. Werkt alleen tegen een goedgekeurde ROUT-lezer." }],
    },
  };
}
