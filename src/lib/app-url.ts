/**
 * Canonical origin — één vaste voordeur voor alle auth-redirects.
 *
 * OAuth-providers (Google voorop) accepteren alleen redirect-URI's die exact in
 * hun whitelist staan. Preview-/deploy-hosts met een willekeurige hash mogen
 * daarom nooit in een callback-URL belanden: dat is precies wat
 * `redirect_uri_mismatch` veroorzaakt.
 *
 * Regel: de callback komt uit `NEXT_PUBLIC_APP_URL` (server:
 * `process.env`, browser: `VITE_NEXT_PUBLIC_APP_URL` / `VITE_APP_URL`).
 * `window.location.origin` wordt alleen gebruikt als die host op de
 * goedgekeurde lijst staat. Anders valt alles terug op het primaire domein —
 * of, lokaal, op `http://localhost:3000`.
 */

import { APP_DOMAINS, normalizeHost, PRIMARY_DOMAIN } from "@/lib/app-domains";

/** Hosts waarop we auth-callbacks vertrouwen. */
const APPROVED_HOSTS: readonly string[] = [
  ...APP_DOMAINS,
  // Explicit: the bare apex (https://rout.be, no www) is a production host —
  // isApprovedHost already matches it via APP_DOMAINS, but keep it on the list
  // by name so the split deployment (rout.be public / rout.dlp.li admin)
  // stays obvious when APP_DOMAINS changes.
  "rout.be",
  "www.rout.be",
  "app.dlp.li",
  "maximilien.brussels",
  // Lovable preview/publish hosts: OAuth state cookies are set on the live
  // host, so previews must be allowed to keep the callback on the same host.
  "lovable.app",
  "lovableproject.com",
];

const LOCAL_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "0.0.0.0"];

/** Local origin on the port the dev server actually listens on (sandbox: 8080). */
function localAppUrl(): string {
  const port = typeof process !== "undefined" ? process.env?.["PORT"]?.trim() : undefined;
  return `http://localhost:${port && /^\d+$/.test(port) ? port : "8080"}`;
}
export const LOCAL_APP_URL = localAppUrl();
export const FALLBACK_APP_URL = `https://${PRIMARY_DOMAIN}`;

/** Het vaste pad van de Google-callback; identiek in dev en productie. */
export const GOOGLE_CALLBACK_PATH = "/api/auth/callback/google";

function isLocal(host: string): boolean {
  return LOCAL_HOSTS.includes(normalizeHost(host));
}

/** Staat deze host op de goedgekeurde lijst (incl. subdomeinen)? */
export function isApprovedHost(host: string | null | undefined): boolean {
  const clean = normalizeHost(host);
  if (!clean) return false;
  if (isLocal(clean)) return true;
  return APPROVED_HOSTS.some((approved) => clean === approved || clean.endsWith(`.${approved}`));
}

function sanitize(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (!isApprovedHost(url.host)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function configuredAppUrl(): string | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const fromVite = sanitize(env["VITE_NEXT_PUBLIC_APP_URL"] ?? env["VITE_APP_URL"]);
  if (fromVite) return fromVite;
  if (typeof process !== "undefined" && process.env) {
    return sanitize(process.env["NEXT_PUBLIC_APP_URL"]);
  }
  return null;
}

let warned = false;

function warnIfMissing() {
  if (warned) return;
  warned = true;
  if (import.meta.env.DEV) {
    console.warn(
      "[auth] NEXT_PUBLIC_APP_URL is niet ingesteld (of wijst naar een niet-goedgekeurd domein). " +
        `Auth-callbacks vallen terug op ${FALLBACK_APP_URL}.`,
    );
  }
}

/**
 * De enige origin die in auth-redirects terecht mag komen.
 *
 * Volgorde: expliciete env-waarde → goedgekeurde huidige host → localhost in
 * dev → het primaire productiedomein.
 */
export function canonicalAppUrl(): string {
  const configured = configuredAppUrl();
  if (configured) return configured;

  if (typeof window !== "undefined") {
    const host = window.location.host;
    if (isLocal(host)) return window.location.origin;
    if (isApprovedHost(host)) return window.location.origin;
  }

  warnIfMissing();
  return import.meta.env.DEV ? LOCAL_APP_URL : FALLBACK_APP_URL;
}

/** Absolute URL binnen de canonieke origin. */
export function canonicalUrl(path: string): string {
  return `${canonicalAppUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Waar de gebruiker na een geslaagde login belandt. */
export function authCallbackUrl(path = "/dashboard"): string {
  return canonicalUrl(path);
}

/** De OAuth-redirect-URI die in de Google Console moet staan. */
export function googleRedirectUri(): string {
  return canonicalUrl(GOOGLE_CALLBACK_PATH);
}
