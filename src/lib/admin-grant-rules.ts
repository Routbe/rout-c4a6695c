/** Pure rules for an admin granting verification without a request (client-safe, tested). */
import { personHandleBase } from "./approved-handles";

export const GRANT_TIERS = ["pro", "influencer", "business"] as const;
export type GrantTier = (typeof GRANT_TIERS)[number];

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9]|[._-](?=[a-z0-9])){2,29}$/;

function fold(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Normalises a website to its bare host; null for IPs, localhost or junk. */
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "");
  s = s.split(/[/?#:]/)[0] ?? "";
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return null;
  if (/^\d+(\.\d+)+$/.test(s)) return null;
  if (s.endsWith(".localhost") || s.endsWith(".local") || s.endsWith(".internal")) return null;
  const labels = s.split(".");
  if (labels.some((l) => !l || l.startsWith("-") || l.endsWith("-"))) return null;
  if (!/^[a-z]{2,}$/.test(labels[labels.length - 1]!)) return null;
  return s;
}

/** A single admin-typed exception, normalised; null when not a valid handle. */
export function normalizeException(raw: string): string | null {
  const h = raw.trim().replace(/^@/, "").toLowerCase();
  return HANDLE_RE.test(h) ? h : null;
}

/** Usernames built from the real name (first + last both required). */
export function nameHandles(firstName: string, lastName: string): string[] {
  const f = fold(firstName);
  const l = fold(lastName);
  if (!f || !l) return [];
  const out = [personHandleBase(firstName, lastName), `${f}.${l}`, `${f}-${l}`, `${f}_${l}`, `${l}.${f}`];
  return [...new Set(out.map((h) => h.slice(0, 30)))].filter((h) => HANDLE_RE.test(h));
}

/** Usernames from a business domain: "bakkerij-jan.be" → bakkerij-jan, bakkerijjan. */
export function domainHandles(domain: string): string[] {
  const host = normalizeDomain(domain);
  if (!host) return [];
  const label = host.split(".").slice(0, -1).join(".");
  const out = [label, label.replace(/[^a-z0-9]/g, "")];
  return [...new Set(out.map((h) => h.slice(0, 30)))].filter((h) => HANDLE_RE.test(h));
}

export type GrantInput = {
  tier: GrantTier;
  firstName?: string;
  lastName?: string;
  domain?: string;
  exceptions?: string[];
};

/** Full allowed list, or an error. Exceptions are only honoured for influencers. */
export function allowedHandlesFor(input: GrantInput): { ok: true; handles: string[] } | { ok: false; reason: string } {
  if (input.tier === "business") {
    const list = domainHandles(input.domain ?? "");
    if (list.length === 0) return { ok: false, reason: "Geef een geldige website-domeinnaam (bv. bakkerij.be)." };
    return { ok: true, handles: list };
  }
  const base = nameHandles(input.firstName ?? "", input.lastName ?? "");
  if (base.length === 0) return { ok: false, reason: "Voornaam en achternaam zijn verplicht." };
  if (input.tier === "pro") {
    if ((input.exceptions ?? []).some((e) => e.trim())) {
      return { ok: false, reason: "Uitzonderingen kunnen alleen bij influencers." };
    }
    return { ok: true, handles: base };
  }
  const extra: string[] = [];
  for (const raw of input.exceptions ?? []) {
    if (!raw.trim()) continue;
    const h = normalizeException(raw);
    if (!h) return { ok: false, reason: `Ongeldige gebruikersnaam: ${raw}` };
    extra.push(h);
  }
  return { ok: true, handles: [...new Set([...base, ...extra])] };
}
