/**
 * Browser-side ledger client. Holds no keys and does no crypto: the enclave
 * worker seals, chains and signs every event and every DPoP proof; this file
 * only moves the resulting ciphertext over HTTP.
 */
import { captureEnclaveScope, enclave } from "@/lib/crypto-enclave/client";
import type { Capability } from "./capabilities";
import type { SignedEvent } from "./events";

type Head = { seq: number; hash: string };
type ReadResult = { head: Head; events: SignedEvent[] };

export class LedgerError extends Error {
  constructor(readonly code: string, readonly status: number, readonly head?: Head) {
    super(`ledger:${code}`);
  }
}

const abs = (path: string) => new URL(path, window.location.origin).toString();

async function call<T>(userId: string, method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const scope = captureEnclaveScope();
  scope.assertCurrent();
  const url = abs(path);
  const dpop = await enclave.protocol.dpop(userId, method, url);
  scope.assertCurrent();
  const res = await fetch(url, {
    method,
    headers: { dpop, ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "omit", // no cookies: the proof is the authorisation
    signal: scope.signal,
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; head?: Head } & T;
  scope.assertCurrent();
  if (!res.ok) throw new LedgerError(json.error ?? "ledger_error", res.status, json.head);
  return json;
}

const newStream = () => {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return `urn:rout:stream:${btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
};

export const ledger = {
  /** Creates a stream controlled by this member's did:key. */
  async createStream(userId: string, descriptor?: Record<string, unknown>): Promise<{ stream: string; head: Head }> {
    const scope = captureEnclaveScope();
    const stream = newStream();
    const event = await enclave.protocol.signEvent(userId, {
      stream,
      seq: 0,
      prev: null,
      kind: "stream.genesis",
      body: descriptor ? { public: descriptor as never } : {},
    });
    scope.assertCurrent();
    await call(userId, "POST", "/api/v1/ledger/events", { event });
    return { stream, head: { seq: 0, hash: event.hash } };
  },

  read: (userId: string, stream: string, after = -1, capability?: Capability) =>
    call<ReadResult>(userId, "GET", `/api/v1/ledger/streams/${encodeURIComponent(stream)}?after=${after}`, undefined,
      capability ? { "x-rout-capability": btoa(JSON.stringify(capability)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") } : {}),

  /** Seals `data`, chains it after the current head and appends it; rebases once on a concurrent write. */
  async append(userId: string, stream: string, kind: string, data: unknown, at?: Head, capability?: Capability): Promise<Head> {
    const scope = captureEnclaveScope();
    let head = at ?? (await ledger.read(userId, stream, Number.MAX_SAFE_INTEGER, capability)).head;
    for (let attempt = 0; attempt < 2; attempt++) {
      scope.assertCurrent();
      const event = await enclave.protocol.sealEvent(userId, { stream, seq: head.seq + 1, prev: head.hash, kind, capId: capability?.id }, data);
      scope.assertCurrent();
      try {
        await call(userId, "POST", "/api/v1/ledger/events", { event, ...(capability ? { capability } : {}) });
        return { seq: event.seq, hash: event.hash };
      } catch (e) {
        if (e instanceof LedgerError && e.code === "chain_conflict" && e.head && attempt === 0) {
          head = e.head;
          continue;
        }
        throw e;
      }
    }
    throw new LedgerError("chain_conflict", 409);
  },

  /** Decrypts every sealed event of a stream inside the enclave and returns `{ seq, kind, data }`. */
  async replay<T = unknown>(userId: string, stream: string): Promise<Array<{ seq: number; kind: string; author: string; data: T | null }>> {
    const scope = captureEnclaveScope();
    const all: SignedEvent[] = [];
    let after = -1;
    for (;;) {
      scope.assertCurrent();
      const { events, head } = await ledger.read(userId, stream, after);
      all.push(...events);
      if (!events.length || events[events.length - 1].seq >= head.seq) break;
      after = events[events.length - 1].seq;
    }
    // Never trust the server's copy: every hash, signature and link is re-checked here.
    const check = await enclave.protocol.verifyChain(all);
    scope.assertCurrent();
    if (!check.ok) throw new LedgerError(check.error, 0);
    const out: Array<{ seq: number; kind: string; author: string; data: T | null }> = [];
    for (const e of all) {
      scope.assertCurrent();
      out.push({ seq: e.seq, kind: e.kind, author: e.author, data: e.body.sealed ? await enclave.protocol.openEvent<T>(userId, e) : null });
    }
    scope.assertCurrent();
    return out;
  },
};
