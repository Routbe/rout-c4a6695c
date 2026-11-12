import { describe, expect, it } from "vitest";
import { earlyBelieverId, genesisStamp } from "./genesis-stamp";

const U = "6f1c2c1e-0000-4000-8000-000000000001";

describe("genesis stamp", () => {
  it("is deterministic and formatted", async () => {
    const a = await genesisStamp("s".repeat(32), U, "2026-01-02T10:00:00Z");
    expect(a).toMatch(/^RG-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(await genesisStamp("s".repeat(32), U, "2026-01-02T10:00:00.000Z")).toBe(a);
  });
  it("changes with the secret, user or date (cannot be forged)", async () => {
    const a = await genesisStamp("s".repeat(32), U, "2026-01-02T10:00:00Z");
    expect(await genesisStamp("t".repeat(32), U, "2026-01-02T10:00:00Z")).not.toBe(a);
    expect(await genesisStamp("s".repeat(32), U, "2025-01-02T10:00:00Z")).not.toBe(a);
  });
  it("early believer id uses its own prefix", async () => {
    expect(await earlyBelieverId("s".repeat(32), U)).toMatch(/^EB-/);
  });
});
