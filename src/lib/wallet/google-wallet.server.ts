/** Google Wallet "Save" link: RS256 JWT signed with the service account key (async WebCrypto). */
import { googleCardSaveClaims, googleSaveClaims, type GoogleWalletConfig, type WalletCardPayload, type WalletSubject } from "./wallet-pass";

type Claims = { iss: string; aud: string } & Record<string, unknown>;

export async function signGoogleSaveJwt(claims: Claims, cfg: GoogleWalletConfig): Promise<string> {
  const { SignJWT, importPKCS8 } = await import("jose");
  const key = await importPKCS8(cfg.privateKey.replace(/\\n/g, "\n").trim(), "RS256");
  const { iss, aud, ...rest } = claims;
  return new SignJWT(rest)
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt()
    .sign(key);
}

export const googleSaveLink = (jwt: string) => `https://pay.google.com/gp/v/save/${jwt}`;

export async function googleSaveUrl(subject: WalletSubject, origin: string, cfg: GoogleWalletConfig): Promise<string> {
  const claims = googleSaveClaims(subject, { issuerId: cfg.issuerId, serviceAccountEmail: cfg.serviceAccountEmail, origins: [origin] });
  return googleSaveLink(await signGoogleSaveJwt(claims, cfg));
}

/** ROUT Card (profile) save link + JWT. */
export async function googleCardSave(card: WalletCardPayload, origin: string, cfg: GoogleWalletConfig): Promise<{ jwt: string; saveUrl: string }> {
  const claims = googleCardSaveClaims(card, { issuerId: cfg.issuerId, serviceAccountEmail: cfg.serviceAccountEmail, origins: [origin], classId: cfg.classId });
  const jwt = await signGoogleSaveJwt(claims, cfg);
  return { jwt, saveUrl: googleSaveLink(jwt) };
}
