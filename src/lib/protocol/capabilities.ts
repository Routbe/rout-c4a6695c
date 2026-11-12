/**
 * Capability documents (ZCAP-LD / UCAN inspired) for delegating write access
 * to a ledger stream without accounts, sessions or bearer keys.
 *
 * A capability says: `issuer` lets `audience` append events of `actions` to
 * stream `target` between `nbf` and `exp`. The root capability is issued by
 * the stream controller (the author of its genesis event); every further link
 * may only narrow it (same target, subset of actions, shorter lifetime). Each
 * link is Ed25519-signed by its issuer over the canonical document, with the
 * parent bound by hash, so no link can be altered or re-parented.
 */
import { canonicalJson } from "./canonical";
import { isDidKey, signDigest, verifyDigest } from "./did-key";
import { fromB64u, sha256Bytes, sha256Hex, toB64u, utf8 } from "./encoding";

export type Capability = {
  v: 1;
  id: string;
  issuer: string;
  audience: string;
  target: string;
  actions: string[];
  iat: number;
  nbf?: number;
  exp: number;
  parent: Capability | null;
  sig: string;
};

export const MAX_CHAIN_DEPTH = 5;
export const MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
/** Kinds only the stream controller itself may append, never via delegation. */
export const RESERVED_KINDS = ["stream.genesis", "cap.revoke"] as const;

const STREAM_RE = /^urn:rout:stream:[A-Za-z0-9_-]{22}$/;
const ACTION_RE = /^(?:\*|[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)*(?:\.\*)?)$/;
const ID_RE = /^urn:rout:zcap:[A-Za-z0-9_-]{22}$/;

export type CapError =
  | "cap_malformed"
  | "cap_signature_invalid"
  | "cap_chain_too_long"
  | "cap_root_not_controller"
  | "cap_broken_delegation"
  | "cap_target_mismatch"
  | "cap_action_escalation"
  | "cap_lifetime_escalation"
  | "cap_not_yet_valid"
  | "cap_expired"
  | "cap_revoked"
  | "cap_wrong_audience"
  | "cap_action_denied"
  | "cap_reserved_kind";

export const isStreamId = (v: unknown): v is string => typeof v === "string" && STREAM_RE.test(v);

/** `p` covers `c` when it is `*`, equal, or a `prefix.*` that `c` falls under. */
export function actionCovers(p: string, c: string): boolean {
  if (p === "*" || p === c) return true;
  return p.endsWith(".*") && c.startsWith(p.slice(0, -1));
}

const isReserved = (kind: string) => (RESERVED_KINDS as readonly string[]).includes(kind);

export const capabilityHash = (cap: Capability): string => sha256Hex(canonicalJson(cap));

function signingDigest(cap: Omit<Capability, "sig">): Uint8Array {
  const { parent, ...rest } = cap;
  return sha256Bytes(utf8(canonicalJson({ ...rest, parent: parent ? capabilityHash(parent) : null })));
}

function wellFormed(c: unknown): c is Capability {
  if (!c || typeof c !== "object") return false;
  const x = c as Capability;
  return (
    x.v === 1 &&
    typeof x.id === "string" && ID_RE.test(x.id) &&
    isDidKey(x.issuer) &&
    isDidKey(x.audience) &&
    isStreamId(x.target) &&
    Array.isArray(x.actions) && x.actions.length > 0 && x.actions.length <= 32 &&
    x.actions.every((a) => typeof a === "string" && a.length <= 64 && ACTION_RE.test(a)) &&
    Number.isSafeInteger(x.iat) && Number.isSafeInteger(x.exp) && x.exp > x.iat &&
    (x.nbf === undefined || (Number.isSafeInteger(x.nbf) && x.nbf < x.exp)) &&
    typeof x.sig === "string" && /^[A-Za-z0-9_-]{86}$/.test(x.sig) &&
    (x.parent === null || typeof x.parent === "object")
  );
}

export function newCapabilityId(): string {
  return `urn:rout:zcap:${toB64u(crypto.getRandomValues(new Uint8Array(16)))}`;
}

export type CapabilityGrant = {
  audience: string;
  target: string;
  actions: string[];
  exp: number;
  nbf?: number;
  iat?: number;
  id?: string;
};

/** Issues (signs) a capability. `issuerDid` must match `secretKey`; with a parent, it must be the parent's audience. */
export function issueCapability(secretKey: Uint8Array, issuerDid: string, grant: CapabilityGrant, parent: Capability | null = null): Capability {
  const body: Omit<Capability, "sig"> = {
    v: 1,
    id: grant.id ?? newCapabilityId(),
    issuer: issuerDid,
    audience: grant.audience,
    target: grant.target,
    actions: [...grant.actions],
    iat: grant.iat ?? Date.now(),
    ...(grant.nbf !== undefined ? { nbf: grant.nbf } : {}),
    exp: grant.exp,
    parent,
  };
  return { ...body, sig: toB64u(signDigest(secretKey, "rout.zcap.v1", signingDigest(body))) };
}

export type ChainContext = { controller: string; now: number; isRevoked: (id: string) => boolean };
export type ChainResult = { ok: true; leaf: Capability; ids: string[] } | { ok: false; error: CapError };

/** Verifies every link from the root (controller) to the leaf. */
export function verifyCapabilityChain(leaf: unknown, ctx: ChainContext): ChainResult {
  const chain: Capability[] = [];
  let cur: unknown = leaf;
  while (cur) {
    if (chain.length >= MAX_CHAIN_DEPTH) return { ok: false, error: "cap_chain_too_long" };
    if (!wellFormed(cur)) return { ok: false, error: "cap_malformed" };
    chain.push(cur);
    cur = cur.parent;
  }
  if (!chain.length) return { ok: false, error: "cap_malformed" };
  chain.reverse(); // root first
  const seen = new Set<string>();
  for (let i = 0; i < chain.length; i++) {
    const c = chain[i];
    const { sig, ...unsigned } = c;
    let sigBytes: Uint8Array;
    try {
      sigBytes = fromB64u(sig);
    } catch {
      return { ok: false, error: "cap_malformed" };
    }
    if (!verifyDigest(c.issuer, "rout.zcap.v1", signingDigest(unsigned), sigBytes)) return { ok: false, error: "cap_signature_invalid" };
    if (seen.has(c.id)) return { ok: false, error: "cap_malformed" };
    seen.add(c.id);
    if (c.actions.some(isReserved)) return { ok: false, error: "cap_reserved_kind" };
    if (c.exp - c.iat > MAX_LIFETIME_MS) return { ok: false, error: "cap_lifetime_escalation" };
    if (i === 0) {
      if (c.issuer !== ctx.controller) return { ok: false, error: "cap_root_not_controller" };
    } else {
      const p = chain[i - 1];
      if (c.issuer !== p.audience) return { ok: false, error: "cap_broken_delegation" };
      if (c.target !== p.target) return { ok: false, error: "cap_target_mismatch" };
      if (!c.actions.every((a) => p.actions.some((pa) => actionCovers(pa, a)))) return { ok: false, error: "cap_action_escalation" };
      if (c.exp > p.exp || (p.nbf !== undefined && (c.nbf ?? c.iat) < p.nbf)) return { ok: false, error: "cap_lifetime_escalation" };
    }
    if (ctx.isRevoked(c.id)) return { ok: false, error: "cap_revoked" };
    if (c.nbf !== undefined && ctx.now < c.nbf) return { ok: false, error: "cap_not_yet_valid" };
    if (ctx.now >= c.exp) return { ok: false, error: "cap_expired" };
  }
  return { ok: true, leaf: chain[chain.length - 1], ids: chain.map((c) => c.id) };
}

export type InvocationCheck = { author: string; stream: string; kind: string; capId?: string };

/** Can `author` append `kind` to `stream`? The controller always can; anyone else needs a valid chain naming them. */
export function authorizeInvocation(inv: InvocationCheck, cap: unknown, ctx: ChainContext): { ok: true; capIds: string[] } | { ok: false; error: CapError } {
  if (inv.author === ctx.controller) return { ok: true, capIds: [] };
  if (isReserved(inv.kind)) return { ok: false, error: "cap_reserved_kind" };
  if (!cap) return { ok: false, error: "cap_action_denied" };
  const r = verifyCapabilityChain(cap, ctx);
  if (!r.ok) return r;
  if (r.leaf.audience !== inv.author) return { ok: false, error: "cap_wrong_audience" };
  if (inv.capId !== r.leaf.id) return { ok: false, error: "cap_malformed" };
  if (r.leaf.target !== inv.stream) return { ok: false, error: "cap_target_mismatch" };
  if (!r.leaf.actions.some((a) => actionCovers(a, inv.kind))) return { ok: false, error: "cap_action_denied" };
  return { ok: true, capIds: r.ids };
}
