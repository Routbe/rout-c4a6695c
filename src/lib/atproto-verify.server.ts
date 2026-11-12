/**
 * Generic AT Protocol verification engine, shared by Bluesky and Wsocial.
 * Ownership = the handle resolves (DNS TXT `_atproto.<handle>` or
 * `https://<handle>/.well-known/atproto-did`) to a DID whose profile, read via
 * the network's official AppView API, links back to the member's ROUT page.
 */

import { bioContainsRoutLink, isMemberRoutHost, isPublicHost } from "./open-web-rules";

export type AtNetwork = {
  id: "bluesky" | "wsocial";
  label: string;
  /** Handle suffixes that belong to this network. */
  suffixes: string[];
  /** Public AppView used for official profile reads. */
  appView: string;
};

export const AT_NETWORKS: Record<AtNetwork["id"], AtNetwork> = {
  bluesky: {
    id: "bluesky",
    label: "Bluesky",
    suffixes: ["bsky.social", "bsky.team", "blacksky.app", "eurosky.social"],
    appView: "https://public.api.bsky.app",
  },
  wsocial: {
    id: "wsocial",
    label: "wsocial.eu",
    suffixes: ["wsocial.eu"],
    appView: "https://public.api.bsky.app",
  },
};

const HANDLE_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export function normalizeAtHandle(input: string, network: AtNetwork): string | null {
  let h = String(input ?? "").trim().toLowerCase().replace(/^@/, "");
  h = h.replace(/^https?:\/\/(www\.)?(bsky\.app|wsocial\.eu)\/profile\//, "").replace(/\/.*$/, "");
  if (!h) return null;
  if (!h.includes(".")) h = `${h}.${network.suffixes[0]}`;
  return HANDLE_RE.test(h) ? h : null;
}

async function resolveViaDns(handle: string): Promise<string | null> {
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=_atproto.${handle}&type=TXT`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { Answer?: { data: string }[] };
    for (const a of json.Answer ?? []) {
      const did = didFromTxt(a.data);
      if (did) return did;
    }
  } catch {
    /* fall through */
  }
  return null;
}

async function resolveViaWellKnown(handle: string): Promise<string | null> {
  try {
    const { assertPublicHost } = await import("./safe-fetch.server");
    if (!isPublicHost(handle) || !(await assertPublicHost(handle))) return null;
    const res = await fetch(`https://${handle}/.well-known/atproto-did`, { redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const did = (await res.text()).trim();
    return /^did:[a-z]+:[a-zA-Z0-9._:%-]+$/.test(did) ? did : null;
  } catch {
    return null;
  }
}

export async function resolveAtHandle(handle: string): Promise<string | null> {
  if (!HANDLE_RE.test(handle) || !isPublicHost(handle)) return null;
  return (await resolveViaDns(handle)) ?? (await resolveViaWellKnown(handle));
}

/** DNS JSON encodes TXT records as one or more quoted character strings. */
export function didFromTxt(raw: string): string | null {
  let value = raw.trim();
  if (value.startsWith('"')) {
    const segments = value.match(/"(?:[^"\\]|\\.)*"/g);
    if (!segments || value.replace(/"(?:[^"\\]|\\.)*"/g, "").trim()) return null;
    try { value = segments.map((s) => JSON.parse(s) as string).join(""); } catch { return null; }
  }
  const match = /^did=(did:[a-z]+:[a-zA-Z0-9._:%-]+)$/.exec(value);
  return match?.[1] ?? null;
}

export type AtVerifyResult =
  | { ok: true; did: string; handle: string; network: AtNetwork["id"] }
  | { ok: false; reason: "invalid_handle" | "unresolved" | "no_profile" | "link_missing" };

/** Checks that `handle` on `network` belongs to the ROUT member `routHandle`. */
export async function verifyAtHandle(
  networkId: AtNetwork["id"],
  rawHandle: string,
  routHandle: string,
): Promise<AtVerifyResult> {
  const network = AT_NETWORKS[networkId];
  const handle = normalizeAtHandle(rawHandle, network);
  if (!handle) return { ok: false, reason: "invalid_handle" };
  // A custom domain equal to the member's own rout.be subdomain is proof by itself.
  const did = await resolveAtHandle(handle);
  if (!did) return { ok: false, reason: "unresolved" };
  try {
    const res = await fetch(`${network.appView}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
    if (!res.ok) return { ok: false, reason: "no_profile" };
    const p = (await res.json()) as { handle?: string; description?: string };
    if ((p.handle ?? "").toLowerCase() !== handle) return { ok: false, reason: "unresolved" };
    const r = routHandle.toLowerCase().replace(/^@/, "");
    const linked = isMemberRoutHost(handle, r) || bioContainsRoutLink(p.description, r);
    return linked ? { ok: true, did, handle, network: networkId } : { ok: false, reason: "link_missing" };
  } catch {
    return { ok: false, reason: "no_profile" };
  }
}
