import { afterEach, describe, expect, it, vi } from "vitest";
import { AT_NETWORKS, didFromTxt, normalizeAtHandle, verifyAtHandle } from "./atproto-verify.server";

describe("AT Protocol handles", () => {
  it("bare Wsocial name gets the wsocial.eu domain", () =>
    expect(normalizeAtHandle("jona", AT_NETWORKS.wsocial)).toBe("jona.wsocial.eu"));
  it("bare Bluesky name gets bsky.social", () =>
    expect(normalizeAtHandle("@Jona", AT_NETWORKS.bluesky)).toBe("jona.bsky.social"));
  it("rejects garbage", () => expect(normalizeAtHandle("a b", AT_NETWORKS.bluesky)).toBeNull());
});

describe("AT ownership proofs", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each(["anna.rout.be", "anna.u.rout.be", "anna.r.rout.be"])("verifies %s against its resolved account", async (host) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ Answer: [{ data: '"did=did:plc:abc123"' }] }))).mockResolvedValueOnce(new Response(JSON.stringify({ handle: host }))));
    expect(await verifyAtHandle("bluesky", host, "anna")).toEqual({ ok: true, did: "did:plc:abc123", handle: host, network: "bluesky" });
  });
  it("rejects a nested lookalike without a bio proof", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ Answer: [{ data: '"did=did:plc:abc123"' }] }))).mockResolvedValueOnce(new Response(JSON.stringify({ handle: "other.anna.rout.be", description: "https://rout.be/annabel" }))));
    expect(await verifyAtHandle("bluesky", "other.anna.rout.be", "anna")).toEqual({ ok: false, reason: "link_missing" });
  });
  it("joins segmented TXT strings", () => {
    expect(didFromTxt('"did=did:plc:" "abc123"')).toBe("did:plc:abc123");
  });
  it("rejects malformed TXT", () => {
    expect(didFromTxt('"did=did:plc:abc123" junk')).toBeNull();
    expect(didFromTxt('"did=not-a-did"')).toBeNull();
  });
});
