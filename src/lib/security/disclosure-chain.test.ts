// @vitest-environment node
import { expect, it } from "vitest";
import { GENESIS_HASH, sha256Hex } from "@/lib/audit-chain";
import { disclosureInput, merkleRoot, verifyDisclosureChain, type DisclosureEntry } from "./disclosure-chain";
async function entries() {
  const first: DisclosureEntry = { id: "1", userId: "u", clientId: "a", scopes: ["sybil:verify"], timestamp: "2026-10-31T19:47:00.000Z", previousHash: GENESIS_HASH, entryHash: "" };
  first.entryHash = await sha256Hex(disclosureInput(first));
  const second = { ...first, id: "2", clientId: "b", previousHash: first.entryHash };
  second.entryHash = await sha256Hex(disclosureInput(second));
  return [first, second];
}
it("validates a complete chain from genesis", async () => expect((await verifyDisclosureChain(await entries())).verified).toBe(true));
it("detects changed scopes", async () => {
  const rows = await entries(); rows[1].scopes.push("identity:legal_name");
  expect((await verifyDisclosureChain(rows)).verified).toBe(false);
});
it("detects missing or reordered entries", async () => {
  const rows = await entries();
  expect((await verifyDisclosureChain(rows.slice(1))).verified).toBe(false);
  expect((await verifyDisclosureChain(rows.reverse())).verified).toBe(false);
});
it("detects truncation against a retained head", async () => {
  const rows = await entries();
  expect((await verifyDisclosureChain(rows.slice(0, 1), rows[1].entryHash)).verified).toBe(false);
});
it("Merkle root changes on tampering and ordering", async () => {
  const leaves = (await entries()).map((r) => r.entryHash);
  const root = await merkleRoot(leaves);
  expect(root).toMatch(/^[a-f0-9]{64}$/);
  expect(await merkleRoot([...leaves].reverse())).not.toBe(root);
  expect(await merkleRoot([leaves[0], "f".repeat(64)])).not.toBe(root);
  expect(await merkleRoot(leaves.slice(0, 1))).not.toBe(root);
});