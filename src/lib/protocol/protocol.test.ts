// @vitest-environment node
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical";
import { authorizeInvocation, issueCapability, verifyCapabilityChain, type Capability } from "./capabilities";
import { didFromPublicKey, isDidKey, newIdentityKey, publicKeyFromDid } from "./did-key";
import { createDpopProof, verifyDpop } from "./dpop";
import { fromBase58, toBase58, toB64u } from "./encoding";
import { checkBody, newStreamId, signEvent, verifyChain, verifyEvent, type SignedEvent } from "./events";

const sealed = () => ({ blob: `v1.${toB64u(crypto.getRandomValues(new Uint8Array(12)))}.${toB64u(crypto.getRandomValues(new Uint8Array(40)))}`, keyId: "dk_abcdefgh12" });

function genesis(sk: Uint8Array, stream: string) {
  return signEvent(sk, { stream, seq: 0, prev: null, kind: "stream.genesis", body: { public: { "@context": "https://schema.org", "@type": "ProfilePage" } } });
}

describe("encodings", () => {
  it("canonical JSON sorts keys and rejects unsafe values", () => {
    expect(canonicalJson({ b: 1, a: [true, null, "x"], c: undefined })).toBe('{"a":[true,null,"x"],"b":1}');
    expect(() => canonicalJson({ n: NaN })).toThrow();
    expect(() => canonicalJson({ d: new Date() })).toThrow();
    expect(() => canonicalJson({ big: 2 ** 60 })).toThrow();
  });
  it("base58 round-trips leading zeros", () => {
    const b = new Uint8Array([0, 0, 1, 2, 255]);
    expect(fromBase58(toBase58(b))).toEqual(b);
  });
  it("did:key round-trips the public key", () => {
    const { did } = newIdentityKey();
    expect(did.startsWith("did:key:z6Mk")).toBe(true);
    expect(isDidKey(did)).toBe(true);
    expect(didFromPublicKey(publicKeyFromDid(did))).toBe(did);
    expect(isDidKey("did:key:zNotAKey")).toBe(false);
  });
});

describe("merkle-chained events", () => {
  const owner = newIdentityKey();
  const stream = newStreamId();

  it("verifies a signed chain and links each event to the previous hash", () => {
    const g = genesis(owner.secretKey, stream);
    const e1 = signEvent(owner.secretKey, { stream, seq: 1, prev: g.hash, kind: "profile.patch", body: { sealed: sealed() } });
    const e2 = signEvent(owner.secretKey, { stream, seq: 2, prev: e1.hash, kind: "profile.patch", body: { sealed: sealed() } });
    expect(verifyChain([g, e1, e2])).toEqual({ ok: true });
  });

  it("rejects a tampered body, a forged signature and a broken link", () => {
    const g = genesis(owner.secretKey, stream);
    const e1 = signEvent(owner.secretKey, { stream, seq: 1, prev: g.hash, kind: "profile.patch", body: { sealed: sealed() } });
    const tampered: SignedEvent = { ...e1, body: { sealed: sealed() } };
    expect(verifyEvent(tampered)).toEqual({ ok: false, error: "event_hash_mismatch" });

    const intruder = newIdentityKey();
    const forged = signEvent(intruder.secretKey, { stream, seq: 1, prev: g.hash, kind: "profile.patch", body: e1.body });
    expect(verifyEvent({ ...forged, author: owner.did })).toEqual({ ok: false, error: "event_hash_mismatch" });
    const rehashed = { ...forged, author: owner.did };
    // Re-hash with the owner's DID but keep the intruder's signature.
    const { hash: _h, sig, ...rest } = rehashed;
    const resigned = signEvent(owner.secretKey, { ...rest, ts: rest.ts });
    expect(verifyEvent({ ...resigned, sig })).toEqual({ ok: false, error: "event_signature_invalid" });

    const orphan = signEvent(owner.secretKey, { stream, seq: 1, prev: "0".repeat(64), kind: "profile.patch", body: { sealed: sealed() } });
    expect(verifyChain([g, orphan])).toMatchObject({ ok: false, error: "event_chain_broken", at: 1 });
    expect(verifyChain([g, e1].reverse())).toMatchObject({ ok: false });
  });

  it("refuses readable state: private kinds must be ciphertext", () => {
    expect(checkBody("profile.patch", { public: { name: "Daniel" } })).toBe("event_public_forbidden");
    expect(checkBody("profile.patch", { sealed: { blob: '{"name":"Daniel"}', keyId: "dk_abcdefgh12" } })).toBe("event_body_not_sealed");
    expect(checkBody("profile.patch", {})).toBe("event_body_not_sealed");
    expect(checkBody("pub.profile", { public: { "@context": "https://schema.org", email: "a@b.c" } })).toBe("event_public_pii");
    expect(checkBody("pub.profile", { public: { "@context": "https://schema.org", contact: { telephone: "1" } } })).toBe("event_public_pii");
    expect(checkBody("pub.profile", { public: { "@context": "https://schema.org", name: "ROUT" } })).toBeNull();
    expect(checkBody("profile.patch", { sealed: sealed() })).toBeNull();
  });

  it("rejects events outside the clock window", () => {
    const g = signEvent(owner.secretKey, { stream, seq: 0, prev: null, kind: "stream.genesis", body: {}, ts: Date.now() - 10 * 60_000 });
    expect(verifyEvent(g)).toEqual({ ok: false, error: "event_clock_skew" });
  });
});

describe("capability delegation", () => {
  const owner = newIdentityKey();
  const agent = newIdentityKey();
  const sub = newIdentityKey();
  const stream = newStreamId();
  const now = Date.now();
  const ctx = { controller: owner.did, now, isRevoked: () => false };
  const root = (over: Partial<Parameters<typeof issueCapability>[2]> = {}) =>
    issueCapability(owner.secretKey, owner.did, { audience: agent.did, target: stream, actions: ["profile.*"], exp: now + 3_600_000, iat: now, ...over });

  it("lets a delegated agent append only what it was granted", () => {
    const cap = root();
    const ok = authorizeInvocation({ author: agent.did, stream, kind: "profile.patch", capId: cap.id }, cap, ctx);
    expect(ok.ok).toBe(true);
    expect(authorizeInvocation({ author: agent.did, stream, kind: "billing.update", capId: cap.id }, cap, ctx)).toEqual({ ok: false, error: "cap_action_denied" });
    expect(authorizeInvocation({ author: sub.did, stream, kind: "profile.patch", capId: cap.id }, cap, ctx)).toEqual({ ok: false, error: "cap_wrong_audience" });
    expect(authorizeInvocation({ author: agent.did, stream: newStreamId(), kind: "profile.patch", capId: cap.id }, cap, ctx)).toEqual({ ok: false, error: "cap_target_mismatch" });
    expect(authorizeInvocation({ author: agent.did, stream, kind: "profile.patch" }, null, ctx)).toEqual({ ok: false, error: "cap_action_denied" });
  });

  it("allows attenuated re-delegation and blocks escalation", () => {
    const cap = root();
    const narrow = issueCapability(agent.secretKey, agent.did, { audience: sub.did, target: stream, actions: ["profile.patch"], exp: now + 600_000, iat: now }, cap);
    expect(verifyCapabilityChain(narrow, ctx).ok).toBe(true);
    const wider = issueCapability(agent.secretKey, agent.did, { audience: sub.did, target: stream, actions: ["*"], exp: now + 600_000, iat: now }, cap);
    expect(verifyCapabilityChain(wider, ctx)).toEqual({ ok: false, error: "cap_action_escalation" });
    const longer = issueCapability(agent.secretKey, agent.did, { audience: sub.did, target: stream, actions: ["profile.patch"], exp: now + 7_200_000, iat: now }, cap);
    expect(verifyCapabilityChain(longer, ctx)).toEqual({ ok: false, error: "cap_lifetime_escalation" });
    const hijack = issueCapability(sub.secretKey, sub.did, { audience: sub.did, target: stream, actions: ["profile.patch"], exp: now + 600_000, iat: now }, cap);
    expect(verifyCapabilityChain(hijack, ctx)).toEqual({ ok: false, error: "cap_broken_delegation" });
  });

  it("rejects forged, expired, revoked, self-issued and reserved capabilities", () => {
    const cap = root();
    const forged: Capability = { ...cap, actions: ["*"] };
    expect(verifyCapabilityChain(forged, ctx)).toEqual({ ok: false, error: "cap_signature_invalid" });
    expect(verifyCapabilityChain(root({ exp: now - 1, iat: now - 1000 }), ctx)).toEqual({ ok: false, error: "cap_expired" });
    expect(verifyCapabilityChain(cap, { ...ctx, isRevoked: (id) => id === cap.id })).toEqual({ ok: false, error: "cap_revoked" });
    const self = issueCapability(agent.secretKey, agent.did, { audience: agent.did, target: stream, actions: ["*"], exp: now + 1000, iat: now });
    expect(verifyCapabilityChain(self, ctx)).toEqual({ ok: false, error: "cap_root_not_controller" });
    expect(verifyCapabilityChain(root({ actions: ["cap.revoke"] }), ctx)).toEqual({ ok: false, error: "cap_reserved_kind" });
    expect(authorizeInvocation({ author: agent.did, stream, kind: "cap.revoke", capId: cap.id }, root({ actions: ["*"] }), ctx)).toEqual({ ok: false, error: "cap_reserved_kind" });
    expect(verifyCapabilityChain(root({ exp: now + 40 * 86_400_000 }), ctx)).toEqual({ ok: false, error: "cap_lifetime_escalation" });
  });
});

describe("DPoP proofs", () => {
  const { secretKey, did } = newIdentityKey();
  const url = "https://rout.be/api/v1/ledger/events";

  it("binds the proof to the key, method, URL and time", () => {
    const proof = createDpopProof(secretKey, "POST", url);
    const ok = verifyDpop(proof, { method: "POST", urls: [url] });
    expect(ok).toMatchObject({ ok: true, did });
    expect(verifyDpop(proof, { method: "GET", urls: [url] })).toEqual({ ok: false, error: "dpop_method_mismatch" });
    expect(verifyDpop(proof, { method: "POST", urls: ["https://evil.example/api/v1/ledger/events"] })).toEqual({ ok: false, error: "dpop_url_mismatch" });
    const old = createDpopProof(secretKey, "POST", url, { nowS: Math.floor(Date.now() / 1000) - 120 });
    expect(verifyDpop(old, { method: "POST", urls: [url] })).toEqual({ ok: false, error: "dpop_stale" });
    expect(verifyDpop(null, { method: "POST", urls: [url] })).toEqual({ ok: false, error: "dpop_missing" });
  });

  it("rejects a proof whose payload was swapped", () => {
    const a = createDpopProof(secretKey, "POST", url).split(".");
    const b = createDpopProof(secretKey, "POST", "https://rout.be/api/v1/other").split(".");
    expect(verifyDpop(`${a[0]}.${b[1]}.${a[2]}`, { method: "POST", urls: ["https://rout.be/api/v1/other"] })).toEqual({ ok: false, error: "dpop_signature_invalid" });
  });
});
