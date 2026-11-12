import { z } from "zod";
import { cleanRedirectUri } from "./redirect-match";

/**
 * Strict Zod schemas for every Developer Console input. Shared by the server
 * (inputValidator) and forms so both follow the same rules.
 */

const isLocal = (h: string) => h === "localhost" || h === "127.0.0.1";

/** Optional https URL (empty → null). */
export const optionalHttpsUrl = z
  .string()
  .trim()
  .max(300)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => {
    if (!v) return true;
    try {
      return new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  }, "Gebruik een volledige https-URL.");

export const redirectUriSchema = z
  .string()
  .max(2000)
  .transform((v) => cleanRedirectUri(v))
  .pipe(z.string().min(1).max(1000))
  .refine((v) => {
    try {
      const u = new URL(v);
      if (u.hash || v.includes("*")) return false;
      return u.protocol === "https:" || (u.protocol === "http:" && isLocal(u.hostname));
    } catch {
      return false;
    }
  }, "Redirect-URI's moeten https gebruiken (http enkel voor localhost) en mogen geen #fragment of * bevatten.");

export const MAX_REDIRECT_URIS = 10;

/** Agent scopes are human-delegated and always ride on ≤1 h tokens (src/lib/agent/agent-scopes.ts). */
export const scopeEnum = z.enum(["openid", "profile", "email", "linked_accounts", "accounts:merge", "identity:handle_reservation", "assets:write", "profile:draft", "identity:read_public"]);

export const clientSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).nullable().optional(),
    logoUrl: optionalHttpsUrl,
    homepageUrl: optionalHttpsUrl,
    privacyUrl: optionalHttpsUrl,
    termsUrl: optionalHttpsUrl,
    redirectUris: z.array(redirectUriSchema).max(MAX_REDIRECT_URIS),
    postLogoutRedirectUris: z.array(redirectUriSchema).max(MAX_REDIRECT_URIS).optional(),
    scopes: z.array(scopeEnum).max(7),
    flowPreference: z.enum(["seamless", "strict"]).optional(),
    richIdentityEnabled: z.boolean().optional(),
    handleSyncEnabled: z.boolean().optional(),
  })
  .strict();

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** undefined = unchanged, "" / null = clear. */
const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .nullable()
  .optional()
  .refine((v) => !v || emailRe.test(v), "Ongeldig e-mailadres.");

const ipSchema = z
  .string()
  .trim()
  .max(45)
  .refine(
    (v) =>
      (/^(\d{1,3}\.){3}\d{1,3}$/.test(v) && v.split(".").every((p) => Number(p) <= 255)) ||
      (/^[0-9a-f:]+$/i.test(v) && v.includes(":")),
    "Ongeldig IP-adres (enkel exacte IPv4/IPv6-adressen).",
  );

export const settingsSchema = z
  .object({
    id: z.string().uuid(),
    publishingStatus: z.enum(["testing", "production"]).optional(),
    supportEmail: optionalEmail,
    legalOwner: z.string().trim().max(160).nullable().optional(),
    dpoEmail: optionalEmail,
    requirePkce: z.boolean().optional(),
    accessTokenTtl: z.number().int().min(300).max(86400).optional(),
    allowedIps: z.array(ipSchema).max(20).optional(),
    accountDiscoveryEnabled: z.boolean().optional(),
  })
  .strict();

export const testUserSchema = z
  .object({
    id: z.string().uuid(),
    identifier: z
      .string()
      .trim()
      .toLowerCase()
      .max(200)
      .transform((v) => v.replace(/^@/, ""))
      .refine((v) => emailRe.test(v) || /^[a-z0-9._-]{2,40}$/.test(v), "Geef een e-mailadres of ROUT-handle."),
  })
  .strict();

export const verificationRequestSchema = z
  .object({ id: z.string().uuid(), note: z.string().trim().max(1000).optional() })
  .strict();
