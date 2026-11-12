import { describe, expect, it } from "vitest";
import { GENESIS_HASH, chainInput, sha256Hex, verifyChain, type AuditRow } from "@/lib/audit-chain";

async function row(id: number, prev: string, eventType: string): Promise<AuditRow> {
  const base = { eventType, userId: "u1", actorId: "u1", payloadText: "{}", createdAt: "2026-10-30T16:48:00.000Z" };
  return { id, ...base, prevHash: prev, currentHash: await sha256Hex(chainInput(prev, base)) };
}

describe("audit chain", () => {
  it("accepts an intact chain", async () => {
    const a = await row(1, GENESIS_HASH, "login");
    const b = await row(2, a.currentHash, "vault_export");
    expect(await verifyChain([a, b])).toBeNull();
  });

  it("detects a tampered row", async () => {
    const a = await row(1, GENESIS_HASH, "login");
    const b = await row(2, a.currentHash, "vault_export");
    expect(await verifyChain([{ ...a, eventType: "nothing" }, b])).toBe(1);
  });
});
