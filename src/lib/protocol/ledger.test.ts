// @vitest-environment node
import { describe, expect, it } from "vitest";
import { issueCapability } from "./capabilities";
import { newIdentityKey } from "./did-key";
import { createDpopProof } from "./dpop";
import { toB64u, utf8 } from "./encoding";
import { newStreamId, signEvent, verifyChain, type SignedEvent } from "./events";
import { handleAppend, handleRead, type LedgerStore } from "./ledger.server";

const URL_ = "https://rout.be/api/v1/ledger/events";

function memoryStore() {
  const streams = new Map<string, SignedEvent[]>();
  const jtis = new Set<string>();
  const store: LedgerStore = {
    async head(s) {
      const ev = streams.get(s);
      if (!ev?.length) return null;
      const last = ev[ev.length - 1];
      return { controller: ev[0].author, seq: last.seq, hash: last.hash };
    },
    async revoked(s, ids) {
      const ev = streams.get(s) ?? [];
      return new Set(ev.filter((e) => e.kind === "cap.revoke" && e.author === ev[0].author).map((e) => String(e.body.public?.capId)).filter((id) => ids.includes(id)));
    },
    async spendDpop(jkt, jti) {
      const k = `${jkt}:${jti}`;
      if (jtis.has(k)) return false;
      jtis.add(k);
      return true;
    },
    async append(e) {
      const ev = streams.get(e.stream) ?? [];
      if (e.seq === 0) {
        if (ev.length) return "conflict";
        streams.set(e.stream, [e]);
        return "ok";
      }
      if (!ev.length) return "unknown_stream";
      const last = ev[ev.length - 1];
      if (e.seq !== last.seq + 1) return "conflict";
      if (e.prev !== last.hash) return "chain_broken";
      ev.push(e);
      return "ok";
    },
    async read(s, after, limit) {
      return (streams.get(s) ?? []).filter((e) => e.seq > after).slice(0, limit);
    },
  };
  return { store, streams };
}

const sealed = () => ({ blob: `v1.${toB64u(crypto.getRandomValues(new Uint8Array(12)))}.${toB64u(crypto.getRandomValues(new Uint8Array(48)))}`, keyId: "dk_abcdefgh12" });

function post(sk: Uint8Array, body: unknown, proof = createDpopProof(sk, "POST", URL_)) {
  return new Request(URL_, { method: "POST", headers: { "content-type": "application/json", dpop: proof }, body: JSON.stringify(body) });
}
const json = async (r: Response) => ({ ...(await r.json()), status: r.status });

describe("blind ledger append", () => {
  it("accepts a signed chain from the controller and a delegated agent, rejecting everything else", async () => {
    const { store, streams } = memoryStore();
    const owner = newIdentityKey();
    const agent = newIdentityKey();
    const stranger = newIdentityKey();
    const stream = newStreamId();

    const g = signEvent(owner.secretKey, { stream, seq: 0, prev: null, kind: "stream.genesis", body: {} });
    expect(await json(await handleAppend(post(owner.secretKey, { event: g }), store))).toMatchObject({ status: 201, seq: 0 });

    // Readable state is refused even from the controller.
    const plain = signEvent(owner.secretKey, { stream, seq: 1, prev: g.hash, kind: "profile.patch", body: { public: { bio: "hi" } } });
    expect(await json(await handleAppend(post(owner.secretKey, { event: plain }), store))).toMatchObject({ status: 422, error: "event_public_forbidden" });

    const e1 = signEvent(owner.secretKey, { stream, seq: 1, prev: g.hash, kind: "profile.patch", body: { sealed: sealed() } });
    expect((await handleAppend(post(owner.secretKey, { event: e1 }), store)).status).toBe(201);

    // DPoP key must be the event author's key.
    const e2 = signEvent(owner.secretKey, { stream, seq: 2, prev: e1.hash, kind: "profile.patch", body: { sealed: sealed() } });
    expect(await json(await handleAppend(post(stranger.secretKey, { event: e2 }), store))).toMatchObject({ status: 401, error: "dpop_key_mismatch" });

    // A replayed proof is refused.
    const proof = createDpopProof(owner.secretKey, "POST", URL_);
    expect((await handleAppend(post(owner.secretKey, { event: e2 }, proof), store)).status).toBe(201);
    const e3 = signEvent(owner.secretKey, { stream, seq: 3, prev: e2.hash, kind: "profile.patch", body: { sealed: sealed() } });
    expect(await json(await handleAppend(post(owner.secretKey, { event: e3 }, proof), store))).toMatchObject({ status: 401, error: "dpop_replay" });

    // A fork (stale prev) gets the current head back.
    const fork = signEvent(owner.secretKey, { stream, seq: 2, prev: e1.hash, kind: "profile.patch", body: { sealed: sealed() } });
    expect(await json(await handleAppend(post(owner.secretKey, { event: fork }), store))).toMatchObject({ status: 409, error: "chain_conflict", head: { seq: 2, hash: e2.hash } });

    // Agent without capability → denied; with one → accepted.
    const a3 = signEvent(agent.secretKey, { stream, seq: 3, prev: e2.hash, kind: "profile.patch", body: { sealed: sealed() } });
    expect(await json(await handleAppend(post(agent.secretKey, { event: a3 }), store))).toMatchObject({ status: 403, error: "cap_action_denied" });
    const cap = issueCapability(owner.secretKey, owner.did, { audience: agent.did, target: stream, actions: ["profile.*"], exp: Date.now() + 3_600_000 });
    const a3c = signEvent(agent.secretKey, { stream, seq: 3, prev: e2.hash, kind: "profile.patch", body: { sealed: sealed() }, capId: cap.id });
    expect((await handleAppend(post(agent.secretKey, { event: a3c, capability: cap }), store)).status).toBe(201);
    // …but not outside its grant.
    const a4 = signEvent(agent.secretKey, { stream, seq: 4, prev: a3c.hash, kind: "billing.update", body: { sealed: sealed() }, capId: cap.id });
    expect(await json(await handleAppend(post(agent.secretKey, { event: a4, capability: cap }), store))).toMatchObject({ status: 403, error: "cap_action_denied" });

    // The controller revokes; the capability stops working at once.
    const rv = signEvent(owner.secretKey, { stream, seq: 4, prev: a3c.hash, kind: "cap.revoke", body: { public: { capId: cap.id } } });
    expect((await handleAppend(post(owner.secretKey, { event: rv }), store)).status).toBe(201);
    const a5 = signEvent(agent.secretKey, { stream, seq: 5, prev: rv.hash, kind: "profile.patch", body: { sealed: sealed() }, capId: cap.id });
    expect(await json(await handleAppend(post(agent.secretKey, { event: a5, capability: cap }), store))).toMatchObject({ status: 403, error: "cap_revoked" });

    // What was stored is a valid chain, and contains no plaintext state.
    const stored = streams.get(stream)!;
    expect(stored.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4]);
    expect(verifyChain(stored)).toEqual({ ok: true });
    expect(JSON.stringify(stored)).not.toContain("hi");
  });

  it("only lets the controller or a ledger.read delegate read a stream", async () => {
    const { store } = memoryStore();
    const owner = newIdentityKey();
    const reader = newIdentityKey();
    const stream = newStreamId();
    const g = signEvent(owner.secretKey, { stream, seq: 0, prev: null, kind: "stream.genesis", body: {} });
    await handleAppend(post(owner.secretKey, { event: g }), store);
    const readUrl = `https://rout.be/api/v1/ledger/streams/${stream}`;
    const get = (sk: Uint8Array, headers: Record<string, string> = {}) =>
      new Request(`${readUrl}?after=-1`, { headers: { dpop: createDpopProof(sk, "GET", readUrl), ...headers } });

    expect((await handleRead(get(owner.secretKey), stream, store)).status).toBe(200);
    expect((await handleRead(get(reader.secretKey), stream, store)).status).toBe(403);
    const cap = issueCapability(owner.secretKey, owner.did, { audience: reader.did, target: stream, actions: ["ledger.read"], exp: Date.now() + 60_000 });
    const res = await handleRead(get(reader.secretKey, { "x-rout-capability": toB64u(utf8(JSON.stringify(cap))) }), stream, store);
    expect(await json(res)).toMatchObject({ status: 200, head: { seq: 0 } });
    expect((await handleRead(new Request(readUrl), stream, store)).status).toBe(401);
  });
});
