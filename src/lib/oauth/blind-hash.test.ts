import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { BHM_MAX_HASHES, bhmKindForProvider, bhmPreimage, parseBlindHashes } from "./blind-hash";
import { openCodeDisclosure, sealCodeDisclosure } from "./code-disclosure.server";
import { handlers } from "@/lib/crypto-enclave/enclave-core";

const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const SECRET = "s".repeat(64);

describe("blind hash matching", () => {
  it("separates hashes per app and normalises emails only", () => {
    expect(bhmPreimage("rout_a", { kind: "email", value: "  Oud@Voorbeeld.BE " })).toBe("rout-bhm-v1|rout_a|email:oud@voorbeeld.be");
    expect(bhmPreimage("rout_a", { kind: "github", value: "AbC" })).toBe("rout-bhm-v1|rout_a|github:AbC");
    expect(hex(bhmPreimage("rout_a", { kind: "email", value: "x@y.be" }))).not.toBe(hex(bhmPreimage("rout_b", { kind: "email", value: "x@y.be" })));
  });

  it("accepts at most 20 valid, unique hashes", () => {
    const many = Array.from({ length: 30 }, (_, i) => hex(String(i)));
    expect(parseBlindHashes(many.join(","))).toHaveLength(BHM_MAX_HASHES);
    expect(parseBlindHashes(`${many[0]},${many[0]},nothex,${"a".repeat(63)}`)).toEqual([many[0]]);
  });

  it("never treats a password login as a matchable provider", () => {
    expect(bhmKindForProvider("credential")).toBeNull();
    expect(bhmKindForProvider("Google")).toBe("google");
  });

  it("the enclave returns only the indexes of matching identities", async () => {
    const ids = [{ kind: "email", value: "nee@x.be" }, { kind: "email", value: "ja@x.be" }, { kind: "google", value: "123" }];
    const partner = [hex(bhmPreimage("rout_a", { kind: "email", value: "ja@x.be" }))];
    const hits = await (handlers as never as Record<string, (a: unknown) => Promise<number[]>>)["bhm.match"]!({ clientId: "rout_a", hashes: partner, identities: ids });
    expect(hits).toEqual([1]);
  });

  it("seals the confirmed account inside the code and rejects a changed code", async () => {
    const code = await sealCodeDisclosure("rand123", { kind: "email", value: "ja@x.be" }, SECRET);
    expect(await openCodeDisclosure(code, SECRET)).toEqual({ kind: "email", value: "ja@x.be" });
    expect(await openCodeDisclosure(code.replace("rand123", "rand124"), SECRET)).toBeNull();
    expect(await openCodeDisclosure("plaincode", SECRET)).toBeNull();
  });
});
