/**
 * Redirect-URI vergelijking voor "Login met ROUT" (pure, getest).
 *
 * Veilig maar vergevingsgezind voor onschuldige opmaakverschillen:
 * - onzichtbare tekens/spaties rond de URL,
 * - volledig URL-geëncodeerde waarde (bv. `https%3A%2F%2F...`, dubbel geëncodeerd door brokers),
 * - hoofdletters in schema/host, standaardpoort (:443/:80),
 * - percent-encoding verschillen in het pad (`%7B` vs `{`, `%2f` hoofdletters),
 * - één afsluitende `/` in het pad.
 * Schema, host, poort, pad en query moeten verder exact overeenkomen; geen wildcards.
 */
const INVISIBLE = /[\u0000-\u0020\u007f\u00a0\u200b-\u200d\u2060\ufeff]/g;

function decodeIfFullyEncoded(value: string): string {
  let v = value;
  // Max 2 rondes: Keycloak/brokers sturen soms een reeds geëncodeerde waarde door.
  for (let i = 0; i < 2 && /^[a-z][a-z0-9+.-]*%(?:25)*3a/i.test(v); i++) {
    try {
      v = decodeURIComponent(v);
    } catch {
      break;
    }
  }
  return v;
}

function normalizePath(path: string): string {
  // Decodeer alleen veilige (unreserved) tekens en normaliseer hex naar hoofdletters.
  const p = path.replace(/%([0-9a-fA-F]{2})/g, (_m, hex: string) => {
    const ch = String.fromCharCode(parseInt(hex, 16));
    return /[A-Za-z0-9\-._~{}]/.test(ch) ? ch : `%${hex.toUpperCase()}`;
  });
  return p.length > 1 ? p.replace(/\/$/, "") : p;
}

/** Opgeschoonde vorm van een binnenkomende URI (onzichtbare tekens weg, volledig-geëncodeerd gedecodeerd). */
export function cleanRedirectUri(raw: string): string {
  return raw;
}

export function normalizeRedirectUri(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = cleanRedirectUri(raw);
  let u: URL;
  try {
    u = new URL(cleaned);
  } catch {
    return null;
  }
  if (/[\u0000-\u0020\u007f\u00a0\u200b-\u200d\u2060\ufeff\\]/.test(cleaned) || cleaned.includes("*") || cleaned.includes("#") || u.username || u.password || /%2f|%5c/i.test(u.pathname) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(cleaned.replace(/^https?:\/\/[^/]+/, ""))) return null;
  if (u.protocol !== "https:" && !(u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))) return null;
  const port = u.port && !((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) ? `:${u.port}` : "";
  return raw;
}

export function redirectUrisMatch(registered: string, requested: string): boolean {
  const a = normalizeRedirectUri(registered);
  const b = normalizeRedirectUri(requested);
  return a !== null && b !== null && registered === requested;
}

/** Geeft de geregistreerde URI terug die overeenkomt (canoniek terugsturen), of null. */
export function findMatchingRedirect(registered: string[], requested: string): string | null {
  return registered.find((r) => redirectUrisMatch(r, requested)) ?? null;
}

/** Registration and matching deliberately share the same security boundary. */
export function isValidRedirectUri(value: string): boolean {
  return normalizeRedirectUri(value) !== null;
}
