// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  RecoveryError,
  createPaperFactor,
  createRecoveryCeremony,
  factorKeys,
  paperFactorKeys,
  recoverMasterKey,
  type RecoveryFactor,
} from "./recovery-mpc";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const master = new Uint8Array(32).map((_, i) => i + 1);
const device = factorKeys("device_prf", new Uint8Array(32).fill(7), ALICE);
const card = factorKeys("nfc_card", new Uint8Array(32).fill(9), ALICE);
const paper = createPaperFactor(ALICE);
const pub = { device_prf: device.publicKey, nfc_card: card.publicKey, paper_guardian: paper.keys.publicKey };
const sec = { device_prf: device.secretKey, nfc_card: card.secretKey, paper_guardian: paper.keys.secretKey };

const pick = (...factors: RecoveryFactor[]) => Object.fromEntries(factors.map((f) => [f, sec[f]]));

describe("2-of-3 recovery", async () => {
  const ceremony = await createRecoveryCeremony({ masterKey: master, memberId: ALICE, factorPublicKeys: pub });

  it("any two factors, or all three, rebuild the Master Key", async () => {
    for (const set of [["device_prf", "nfc_card"], ["device_prf", "paper_guardian"], ["nfc_card", "paper_guardian"], ["device_prf", "nfc_card", "paper_guardian"]] as RecoveryFactor[][]) {
      expect([...(await recoverMasterKey({ ceremony, memberId: ALICE, factorSecretKeys: pick(...set) }))]).toEqual([...master]);
    }
  });

  it("one factor alone is refused", async () => {
    for (const f of ["device_prf", "nfc_card", "paper_guardian"] as RecoveryFactor[]) {
      await expect(recoverMasterKey({ ceremony, memberId: ALICE, factorSecretKeys: pick(f) })).rejects.toThrow(RecoveryError);
    }
  });

  it("the paper factor comes back from its 24 words, and a wrong word fails", async () => {
    const words = paper.mnemonic.split(" ");
    expect(words).toHaveLength(24);
    const again = paperFactorKeys(`  ${paper.mnemonic.toUpperCase()} `, ALICE);
    expect([...(await recoverMasterKey({ ceremony, memberId: ALICE, factorSecretKeys: { device_prf: device.secretKey, paper_guardian: again.secretKey } }))]).toEqual([...master]);
    const swapped = [...words];
    [swapped[0], swapped[1]] = [swapped[1] ?? "", swapped[0] ?? ""];
    expect(() => paperFactorKeys(swapped.join(" "), ALICE)).toThrow(RecoveryError);
    // Same words, other member: a different key, so the shard does not open.
    const bobPaper = paperFactorKeys(paper.mnemonic, BOB);
    expect([...bobPaper.publicKey]).not.toEqual([...paper.keys.publicKey]);
  });

  it("shards are bound to their factor, member and ceremony", async () => {
    // A factor key used for another factor's shard.
    await expect(recoverMasterKey({ ceremony, memberId: ALICE, factorSecretKeys: { device_prf: card.secretKey, nfc_card: card.secretKey } })).rejects.toThrow(RecoveryError);
    // The ceremony presented for another member.
    await expect(recoverMasterKey({ ceremony: { ...ceremony, memberId: BOB }, memberId: BOB, factorSecretKeys: pick("device_prf", "nfc_card") })).rejects.toThrow(RecoveryError);
    // Shards of two ceremonies mixed.
    const other = await createRecoveryCeremony({ masterKey: master, memberId: ALICE, factorPublicKeys: pub });
    expect(other.ceremonyId).not.toBe(ceremony.ceremonyId);
    const mixed = { ...ceremony, shards: { ...ceremony.shards, nfc_card: other.shards.nfc_card } };
    await expect(recoverMasterKey({ ceremony: mixed, memberId: ALICE, factorSecretKeys: pick("device_prf", "nfc_card") })).rejects.toThrow(RecoveryError);
  });

  it("detects a tampered shard or sealed Master Key", async () => {
    const shard = ceremony.shards.device_prf.slice();
    shard[shard.length - 1] = (shard[shard.length - 1] ?? 0) ^ 1;
    await expect(recoverMasterKey({ ceremony: { ...ceremony, shards: { ...ceremony.shards, device_prf: shard } }, memberId: ALICE, factorSecretKeys: pick("device_prf", "nfc_card") })).rejects.toThrow(RecoveryError);
    const sealed = ceremony.sealedMaster.slice();
    sealed[30] = (sealed[30] ?? 0) ^ 1;
    await expect(recoverMasterKey({ ceremony: { ...ceremony, sealedMaster: sealed }, memberId: ALICE, factorSecretKeys: pick("device_prf", "nfc_card") })).rejects.toThrow(RecoveryError);
  });

  it("refuses duplicate factor keys and bad inputs at creation", async () => {
    await expect(createRecoveryCeremony({ masterKey: master, memberId: ALICE, factorPublicKeys: { ...pub, nfc_card: device.publicKey } })).rejects.toThrow(TypeError);
    await expect(createRecoveryCeremony({ masterKey: new Uint8Array(16), memberId: ALICE, factorPublicKeys: pub })).rejects.toThrow(TypeError);
    await expect(createRecoveryCeremony({ masterKey: master, memberId: "alice", factorPublicKeys: pub })).rejects.toThrow(TypeError);
  });
});
