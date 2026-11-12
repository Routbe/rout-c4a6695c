/**
 * Blind event ledger endpoint logic. The server never decrypts anything: it
 * checks the DPoP proof (who is calling, for this exact request), the event
 * signature and hash, the chain position, the capability chain for delegated
 * authors, and that private kinds carry only ciphertext — then appends.
 *
 * The store is injected so the full decision path is testable without a database.
 */
import { authorizeInvocation, isStreamId, type Capability } from "./capabilities";
import { verifyDpop } from "./dpop";
import { fromB64u } from "./encoding";
import { verifyEvent, type SignedEvent } from "./events";

export type StreamHead = { controller: string; seq: number; hash: string };
export type AppendOutcome = "ok" | "conflict" | "unknown_stream" | "chain_broken";

export interface LedgerStore {
  head(stream: string): Promise<StreamHead | null>;
  revoked(stream: string, ids: string[]): Promise<Set<string>>;
  spendDpop(jkt: string, jti: string, expiresAt: Date): Promise<boolean>;
  append(e: SignedEvent): Promise<AppendOutcome>;
  read(stream: string, after: number, limit: number): Promise<unknown[]>;
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const MAX_BODY = 140 * 1024;

export function ledgerError(status: number, error: string, extra: Record<string, unknown> = {}): Response {
  const headers: Record<string, string> = { ...JSON_HEADERS };
  if (status === 401) headers["www-authenticate"] = `DPoP error="${error}", algs="EdDSA"`;
  return new Response(JSON.stringify({ status: "error", error, ...extra }), { status, headers });
}
const ok = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify({ status: "ok", ...body }), { status, headers: JSON_HEADERS });

/** URLs a DPoP proof may name for this request: the URL as received, and the configured public origin. */
export function acceptedUrls(request: Request, publicOrigin?: string | null): string[] {
  const url = new URL(request.url);
  const out = [`${url.origin}${url.pathname}`];
  if (publicOrigin) {
    try {
      out.push(`${new URL(publicOrigin).origin}${url.pathname}`);
    } catch {
      /* ignore a malformed setting */
    }
  }
  // The sandbox preview proxies to localhost and sets a sanitised forwarded host.
  const fwd = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
  if (fwd && /^[a-z0-9.-]+(?::\d+)?$/i.test(fwd)) out.push(`https://${fwd}${url.pathname}`);
  return out;
}

function capabilityIds(cap: unknown): string[] {
  const ids: string[] = [];
  let cur = cap as { id?: unknown; parent?: unknown } | null;
  for (let i = 0; cur && typeof cur === "object" && i < 6; i++) {
    if (typeof cur.id === "string" && cur.id.length <= 64) ids.push(cur.id);
    cur = cur.parent as typeof cur;
  }
  return ids;
}

type Caller = { did: string; error?: undefined } | { did?: undefined; error: Response };

async function proveCaller(request: Request, store: LedgerStore, publicOrigin: string | null | undefined): Promise<Caller> {
  const dpop = verifyDpop(request.headers.get("dpop"), { method: request.method, urls: acceptedUrls(request, publicOrigin) });
  if (!dpop.ok) return { error: ledgerError(401, dpop.error) };
  if (!(await store.spendDpop(dpop.jkt, dpop.jti, new Date((dpop.iat + 120) * 1000)))) return { error: ledgerError(401, "dpop_replay") };
  return { did: dpop.did };
}

async function readJson(request: Request): Promise<unknown> {
  const len = Number(request.headers.get("content-length") ?? "0");
  if (len > MAX_BODY) throw new Error("too_large");
  const text = await request.text();
  if (text.length > MAX_BODY) throw new Error("too_large");
  return JSON.parse(text);
}

export async function handleAppend(request: Request, store: LedgerStore, opts: { publicOrigin?: string | null; now?: number } = {}): Promise<Response> {
  let payload: { event?: unknown; capability?: unknown };
  try {
    payload = (await readJson(request)) as typeof payload;
  } catch (e) {
    return e instanceof Error && e.message === "too_large" ? ledgerError(413, "event_too_large") : ledgerError(400, "invalid_json");
  }
  if (!payload || typeof payload !== "object") return ledgerError(400, "invalid_json");

  const caller = await proveCaller(request, store, opts.publicOrigin);
  if (caller.error) return caller.error;

  const v = verifyEvent(payload.event, opts.now);
  if (!v.ok) return ledgerError(v.error === "event_signature_invalid" ? 401 : 422, v.error);
  const event = v.event;
  if (caller.did !== event.author) return ledgerError(401, "dpop_key_mismatch");

  const head = await store.head(event.stream);
  let controller: string;
  if (event.seq === 0) {
    if (head) return ledgerError(409, "stream_exists");
    controller = event.author;
  } else {
    if (!head) return ledgerError(404, "unknown_stream");
    if (event.seq !== head.seq + 1 || event.prev !== head.hash) return ledgerError(409, "chain_conflict", { head: { seq: head.seq, hash: head.hash } });
    controller = head.controller;
  }

  const ids = capabilityIds(payload.capability);
  const revoked = event.author === controller || !ids.length ? new Set<string>() : await store.revoked(event.stream, ids);
  const auth = authorizeInvocation(
    { author: event.author, stream: event.stream, kind: event.kind, capId: event.capId },
    payload.capability as Capability | undefined,
    { controller, now: opts.now ?? Date.now(), isRevoked: (id) => revoked.has(id) },
  );
  if (!auth.ok) return ledgerError(403, auth.error);

  const outcome = await store.append(event);
  if (outcome === "ok") return ok(201, { stream: event.stream, seq: event.seq, hash: event.hash });
  if (outcome === "unknown_stream") return ledgerError(404, "unknown_stream");
  const now = await store.head(event.stream);
  return ledgerError(409, "chain_conflict", now ? { head: { seq: now.seq, hash: now.hash } } : {});
}

/**
 * Reading a stream (ciphertext) needs a DPoP proof from the controller, or from
 * an audience holding a capability for `ledger.read` (sent base64url in `x-rout-capability`).
 */
export async function handleRead(request: Request, streamId: string, store: LedgerStore, opts: { publicOrigin?: string | null; now?: number } = {}): Promise<Response> {
  if (!isStreamId(streamId)) return ledgerError(400, "invalid_stream");
  const caller = await proveCaller(request, store, opts.publicOrigin);
  if (caller.error) return caller.error;
  const head = await store.head(streamId);
  if (!head) return ledgerError(404, "unknown_stream");
  if (caller.did !== head.controller) {
    let cap: unknown = null;
    try {
      const raw = request.headers.get("x-rout-capability");
      if (raw && raw.length < 20_000) cap = JSON.parse(new TextDecoder().decode(fromB64u(raw)));
    } catch {
      return ledgerError(400, "cap_malformed");
    }
    const ids = capabilityIds(cap);
    const revoked = ids.length ? await store.revoked(streamId, ids) : new Set<string>();
    const leafId = (cap as { id?: string } | null)?.id;
    const auth = authorizeInvocation(
      { author: caller.did, stream: streamId, kind: "ledger.read", capId: leafId },
      cap,
      { controller: head.controller, now: opts.now ?? Date.now(), isRevoked: (id) => revoked.has(id) },
    );
    if (!auth.ok) return ledgerError(403, auth.error);
  }
  const url = new URL(request.url);
  const after = Math.max(-1, Math.min(Number.MAX_SAFE_INTEGER, Number.parseInt(url.searchParams.get("after") ?? "-1", 10) || -1));
  const limit = Math.max(1, Math.min(200, Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100));
  const events = await store.read(streamId, after, limit);
  return ok(200, { stream: streamId, head: { seq: head.seq, hash: head.hash }, events });
}

/** Neon-backed store: only security-definer functions from db/0208; the app role has no table access. */
export async function neonLedgerStore(): Promise<LedgerStore> {
  const { sql } = await import("@/lib/neon");
  return {
    async head(stream) {
      const rows = (await sql`select controller, head_seq::text as seq, head_hash from public.rout_protocol_head(${stream})`) as Array<{ controller: string; seq: string; head_hash: string }>;
      const r = rows[0];
      return r ? { controller: r.controller, seq: Number(r.seq), hash: r.head_hash } : null;
    },
    async revoked(stream, ids) {
      const rows = (await sql`select r as id from public.rout_protocol_revoked(${stream}, ${ids}::text[]) r`) as Array<{ id: string }>;
      return new Set(rows.map((r) => r.id));
    },
    async spendDpop(jkt, jti, expiresAt) {
      const rows = (await sql`select public.rout_protocol_dpop_spend(${jkt}, ${jti}, ${expiresAt.toISOString()}::timestamptz) as ok`) as Array<{ ok: boolean }>;
      return rows[0]?.ok === true;
    },
    async append(e) {
      const rows = (await sql`select public.rout_protocol_append(${e.stream}, ${e.seq}::bigint, ${e.prev}, ${e.hash}, ${e.author}, ${e.kind}, ${e.capId ?? null}, ${JSON.stringify(e)}::jsonb) as r`) as Array<{ r: AppendOutcome }>;
      return rows[0]?.r ?? "conflict";
    },
    async read(stream, after, limit) {
      const rows = (await sql`select e from public.rout_protocol_read(${stream}, ${after}::bigint, ${limit}::int) e`) as Array<{ e: unknown }>;
      return rows.map((r) => r.e);
    },
  };
}
