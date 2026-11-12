/**
 * Merkle-chained, signed ledger events.
 *
 * Every mutation (human or agent) is one event in a stream. The event hash is
 * SHA-256 over the canonical unsigned event — which includes `prev`, the hash
 * of the event before it — and the author signs that hash with Ed25519. So
 * each event commits to the whole history behind it: changing, dropping or
 * reordering any earlier event breaks every later hash.
 *
 * Bodies are ciphertext. Only reserved control kinds and `pub.*` kinds may
 * carry a readable `public` part (JSON-LD for SSR / agent discovery), and that
 * part may not contain contact or address fields.
 */
import { canonicalJson, type Json } from "./canonical";
import { isStreamId } from "./capabilities";
import { didOfSecretKey, isDidKey, signDigest, verifyDigest } from "./did-key";
import { fromB64u, fromHex, sha256Hex, toB64u, utf8 } from "./encoding";

export type SealedPart = { blob: string; keyId: string };
export type EventBody = { sealed?: SealedPart; public?: { [k: string]: Json } };

export type UnsignedEvent = {
  v: 1;
  stream: string;
  seq: number;
  prev: string | null;
  author: string;
  kind: string;
  ts: number;
  body: EventBody;
  capId?: string;
};
export type SignedEvent = UnsignedEvent & { hash: string; sig: string };

export const MAX_EVENT_BYTES = 64 * 1024;
export const MAX_PUBLIC_BYTES = 8 * 1024;
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const KIND_RE = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/;
const HASH_RE = /^[0-9a-f]{64}$/;
/** `v1.<iv 12 B>.<ciphertext + 16 B GCM tag>` — the same format as the E2EE device-key seal. */
const SEALED_RE = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/;
const KEY_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
/** Field names that would put contact data or a postal address in readable form. */
const PII_KEY_RE = /e-?mail|phone|telephone|tel$|address|street|postal|zip|birth|iban|passport|ssn|national_?id/i;

export type EventError =
  | "event_malformed"
  | "event_too_large"
  | "event_hash_mismatch"
  | "event_signature_invalid"
  | "event_body_not_sealed"
  | "event_public_forbidden"
  | "event_public_pii"
  | "event_clock_skew"
  | "event_chain_broken";

export function newStreamId(): string {
  return `urn:rout:stream:${toB64u(crypto.getRandomValues(new Uint8Array(16)))}`;
}

export const eventHash = (e: UnsignedEvent): string => sha256Hex(canonicalJson(e));

function stripSignature(e: SignedEvent): UnsignedEvent {
  const { hash: _h, sig: _s, ...rest } = e;
  return rest;
}

function findPiiKey(v: unknown, depth = 0): string | null {
  if (depth > 16 || !v || typeof v !== "object") return null;
  for (const [k, val] of Object.entries(v)) {
    if (PII_KEY_RE.test(k)) return k;
    const hit = findPiiKey(val, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** Body policy: what may be readable on the server for a given kind. */
export function checkBody(kind: string, body: unknown): EventError | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "event_malformed";
  const keys = Object.keys(body);
  if (keys.some((k) => k !== "sealed" && k !== "public")) return "event_malformed";
  const { sealed, public: pub } = body as EventBody;
  if (sealed !== undefined) {
    if (!sealed || typeof sealed !== "object" || Object.keys(sealed).sort().join() !== "blob,keyId") return "event_malformed";
    if (typeof sealed.blob !== "string" || !SEALED_RE.test(sealed.blob) || typeof sealed.keyId !== "string" || !KEY_ID_RE.test(sealed.keyId)) {
      return "event_body_not_sealed";
    }
  }
  if (pub !== undefined) {
    if (!pub || typeof pub !== "object" || Array.isArray(pub)) return "event_malformed";
    if (canonicalJson(pub).length > MAX_PUBLIC_BYTES) return "event_too_large";
    if (findPiiKey(pub)) return "event_public_pii";
  }
  if (kind === "cap.revoke") {
    if (sealed !== undefined || !pub || Object.keys(pub).join() !== "capId" || typeof pub.capId !== "string") return "event_malformed";
    return null;
  }
  if (kind === "stream.genesis") return null; // optional sealed and/or public descriptor
  if (kind.startsWith("pub.")) {
    if (!pub || !("@context" in pub)) return "event_public_forbidden";
    return null;
  }
  if (pub !== undefined) return "event_public_forbidden";
  if (sealed === undefined) return "event_body_not_sealed";
  return null;
}

/** Shape, size, hash and signature of a single event. Chain position is checked by the ledger. */
export function verifyEvent(raw: unknown, now = Date.now()): { ok: true; event: SignedEvent } | { ok: false; error: EventError } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "event_malformed" };
  const e = raw as SignedEvent;
  const allowed = new Set(["v", "stream", "seq", "prev", "author", "kind", "ts", "body", "capId", "hash", "sig"]);
  if (Object.keys(e).some((k) => !allowed.has(k))) return { ok: false, error: "event_malformed" };
  let size: number;
  try {
    size = utf8(canonicalJson(e)).length;
  } catch {
    return { ok: false, error: "event_malformed" };
  }
  if (size > MAX_EVENT_BYTES) return { ok: false, error: "event_too_large" };
  const shapeOk =
    e.v === 1 &&
    isStreamId(e.stream) &&
    Number.isSafeInteger(e.seq) && e.seq >= 0 &&
    (e.seq === 0 ? e.prev === null && e.kind === "stream.genesis" : typeof e.prev === "string" && HASH_RE.test(e.prev) && e.kind !== "stream.genesis") &&
    isDidKey(e.author) &&
    typeof e.kind === "string" && e.kind.length <= 64 && KIND_RE.test(e.kind) &&
    Number.isSafeInteger(e.ts) &&
    (e.capId === undefined || (typeof e.capId === "string" && /^urn:rout:zcap:[A-Za-z0-9_-]{22}$/.test(e.capId))) &&
    typeof e.hash === "string" && HASH_RE.test(e.hash) &&
    typeof e.sig === "string" && /^[A-Za-z0-9_-]{86}$/.test(e.sig);
  if (!shapeOk) return { ok: false, error: "event_malformed" };
  const bodyErr = checkBody(e.kind, e.body);
  if (bodyErr) return { ok: false, error: bodyErr };
  if (Math.abs(now - e.ts) > MAX_CLOCK_SKEW_MS) return { ok: false, error: "event_clock_skew" };
  if (eventHash(stripSignature(e)) !== e.hash) return { ok: false, error: "event_hash_mismatch" };
  if (!verifyDigest(e.author, "rout.event.v1", fromHex(e.hash), fromB64u(e.sig))) return { ok: false, error: "event_signature_invalid" };
  return { ok: true, event: e };
}

/** Verifies a contiguous slice: each event valid, seq consecutive, `prev` = hash of the one before. */
export function verifyChain(events: unknown[], opts: { anchor?: { seq: number; hash: string }; now?: number } = {}): { ok: true } | { ok: false; error: EventError; at: number } {
  let prev = opts.anchor ?? null;
  for (let i = 0; i < events.length; i++) {
    // Historic events are not subject to the clock window, only to integrity.
    const r = verifyEvent(events[i], (events[i] as SignedEvent)?.ts ?? 0);
    if (!r.ok) return { ok: false, error: r.error, at: i };
    const e = r.event;
    if (prev ? e.seq !== prev.seq + 1 || e.prev !== prev.hash : e.seq !== 0) return { ok: false, error: "event_chain_broken", at: i };
    prev = { seq: e.seq, hash: e.hash };
  }
  return { ok: true };
}

export type EventDraft = { stream: string; seq: number; prev: string | null; kind: string; body: EventBody; capId?: string; ts?: number };

/** Builds, hashes and signs an event (enclave worker, agents, tests). */
export function signEvent(secretKey: Uint8Array, draft: EventDraft): SignedEvent {
  const unsigned: UnsignedEvent = {
    v: 1,
    stream: draft.stream,
    seq: draft.seq,
    prev: draft.prev,
    author: didOfSecretKey(secretKey),
    kind: draft.kind,
    ts: draft.ts ?? Date.now(),
    body: draft.body,
    ...(draft.capId ? { capId: draft.capId } : {}),
  };
  const hash = eventHash(unsigned);
  return { ...unsigned, hash, sig: toB64u(signDigest(secretKey, "rout.event.v1", fromHex(hash))) };
}
