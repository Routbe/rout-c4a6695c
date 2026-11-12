import { describe, expect, it } from "vitest";
import { emailOptions, pickOption, resolveAppEmail } from "./email-broker";
import { pairwiseSubject } from "./subject";
import { appSybilNullifier } from "@/lib/auth/oidc-identifiers";

const SECRET = "x".repeat(32);
const opts = emailOptions({ email: "jona@mail.be", verified: true }, [
  { id: "a1", alias: "jona@rout.be", status: "active" },
  { id: "a2", alias: "old@rout.be", status: "pending" },
]);

describe("email broker", () => {
  it("offers the primary address and only active aliases", () => {
    expect(opts.map((o) => o.email)).toEqual(["jona@mail.be", "jona@rout.be"]);
  });
  it("defaults to the primary address", () => {
    expect(resolveAppEmail(null, opts)?.email).toBe("jona@mail.be");
  });
  it("gives the app the chosen alias", () => {
    expect(resolveAppEmail({ source: "alias", aliasId: "a1" }, opts)?.email).toBe("jona@rout.be");
  });
  it("never discloses primary when the chosen alias is gone", () => {
    expect(resolveAppEmail({ source: "alias", aliasId: "gone" }, opts)).toBeNull();
  });
  it("refuses choices that are not the user's own", () => {
    expect(pickOption("a2", opts)).toBeNull();
    expect(pickOption("someone-else", opts)).toBeNull();
  });
});

describe("app-specific identifiers", () => {
  it("two apps get different IDs for the same person", async () => {
    const a = await pairwiseSubject(SECRET, "app-a.example", "user-1");
    const b = await pairwiseSubject(SECRET, "app-b.example", "user-1");
    expect(a).not.toBe(b);
    expect(await pairwiseSubject(SECRET, "app-a.example", "user-1")).toBe(a);
  });
  it("one-human proof is stable per app and differs between apps", async () => {
    const a1 = await appSybilNullifier(SECRET, "client-a", "human-1");
    expect(await appSybilNullifier(SECRET, "client-a", "human-1")).toBe(a1);
    expect(await appSybilNullifier(SECRET, "client-b", "human-1")).not.toBe(a1);
    expect(a1).not.toContain("human-1");
  });
  it("refuses a short pepper", async () => {
    await expect(appSybilNullifier("short", "c", "h")).rejects.toThrow();
  });
});

import { decideForward, forwardAliasLocal, messageIdHash, parseForwardAddress, FORWARD_MAX_BYTES } from "./email-forwarding";

describe("private relay forwarding", () => {
  const base = {
    rule: { status: "active" as const },
    targetEmail: "jona@mail.be",
    targetVerified: true,
    fromAddress: "shop@example.com",
    sizeBytes: 1000,
    duplicate: false,
    rateOk: true,
  };
  it("relay address is stable per app and differs between apps", async () => {
    const a = await forwardAliasLocal("pairwise-subject-app-a-0001");
    expect(a).toMatch(/^priv-[a-f0-9]{20}$/);
    expect(await forwardAliasLocal("pairwise-subject-app-a-0001")).toBe(a);
    expect(await forwardAliasLocal("pairwise-subject-app-b-0001")).not.toBe(a);
  });
  it("accepts only our own relay addresses", () => {
    expect(parseForwardAddress("Shop <priv-0123456789abcdef0123@mail.rout.be>")).toBe("priv-0123456789abcdef0123");
    expect(parseForwardAddress("priv-0123456789abcdef0123@other.be")).toBeNull();
    expect(parseForwardAddress("jona@mail.rout.be")).toBeNull();
  });
  it("forwards to a verified address", () => {
    expect(decideForward(base)).toEqual({ action: "forward" });
  });
  it("refuses unknown, paused and unverified targets", () => {
    expect(decideForward({ ...base, rule: null })).toEqual({ action: "reject", reason: "unknown_alias" });
    expect(decideForward({ ...base, rule: { status: "paused" } })).toEqual({ action: "reject", reason: "inactive" });
    expect(decideForward({ ...base, targetVerified: false })).toEqual({ action: "reject", reason: "unverified_target" });
  });
  it("refuses loops, oversized mail, duplicates and floods", () => {
    expect(decideForward({ ...base, fromAddress: "x@mail.rout.be" })).toEqual({ action: "reject", reason: "loop" });
    expect(decideForward({ ...base, sizeBytes: FORWARD_MAX_BYTES + 1 })).toEqual({ action: "reject", reason: "too_large" });
    expect(decideForward({ ...base, duplicate: true })).toEqual({ action: "reject", reason: "duplicate" });
    expect(decideForward({ ...base, rateOk: false })).toEqual({ action: "reject", reason: "rate_limited" });
  });
  it("never stores the raw Message-ID", async () => {
    const h = await messageIdHash("<abc@example.com>");
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(await messageIdHash("")).toBeNull();
  });
});
