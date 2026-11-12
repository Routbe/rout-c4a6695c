import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isSealedBlob, open, seal } from "@/lib/e2ee/crypto";
import { newMasterKey } from "@/lib/e2ee/recovery";
import { workspaceKeyFromMaster } from "@/lib/e2ee/device-key";
import {
  generateEphemeralSecret,
  handoffCode,
  openVaultPayload,
  parseHandoffCode,
  sealVaultPayload,
  vaultClaimProof,
  vaultCommitSchema,
  workspaceConfigAad,
} from "./ephemeral-vault";
import { hashClaimProof, verifyClaimProof } from "./vault-hash";

const vaultId = "3f2a6c1e-9b4d-4e8f-a1c2-7d5e9f0b1a2c";
const config = { name: "Studio Noord", slug: "studio-noord", apiBase: "https://example.test", flags: { beta: true } };

describe("ephemeral vault — zero-knowledge handoff", () => {
  it("only the ephemeral secret opens the payload, and only in its own vault", async () => {
    const secret = generateEphemeralSecret();
    const blob = await sealVaultPayload(secret, vaultId, config);
    expect(isSealedBlob(blob)).toBe(true);
    expect(blob).not.toContain("Studio");
    await expect(openVaultPayload(secret, vaultId, blob)).resolves.toEqual(config);
    await expect(openVaultPayload(generateEphemeralSecret(), vaultId, blob)).rejects.toThrow();
    await expect(openVaultPayload(secret, "00000000-0000-4000-8000-000000000000", blob)).rejects.toThrow();
  });

  it("the stored argon2id hash accepts the claim proof, not the raw secret or another proof", async () => {
    const secret = generateEphemeralSecret();
    const proof = await vaultClaimProof(secret);
    const hash = await hashClaimProof(proof);
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=8192,t=2,p=1\$/);
    expect(hash).not.toContain(secret);
    expect(await verifyClaimProof(proof, hash)).toBe(true);
    expect(await verifyClaimProof(secret, hash)).toBe(false);
    expect(await verifyClaimProof(await vaultClaimProof(generateEphemeralSecret()), hash)).toBe(false);
  });

  it("the claim proof cannot decrypt the payload", async () => {
    const secret = generateEphemeralSecret();
    const blob = await sealVaultPayload(secret, vaultId, config);
    const proof = await vaultClaimProof(secret);
    await expect(openVaultPayload(proof, vaultId, blob)).rejects.toThrow();
  });

  it("handoff code round-trips from raw input and from a claim URL fragment", () => {
    const secret = generateEphemeralSecret();
    const code = handoffCode(vaultId, secret);
    expect(parseHandoffCode(code)).toEqual({ vaultId, secret });
    expect(parseHandoffCode(`https://rout.be/studio/workspaces/claim#${code}`)).toEqual({ vaultId, secret });
    expect(parseHandoffCode("ROUT-ABCDE-FGHIJ")).toBeNull();
  });

  it("re-encryption uses the member's own key: the ephemeral key cannot open it, the member's key can", async () => {
    const userId = "11111111-2222-4333-8444-555555555555";
    const { key: master } = newMasterKey();
    const mine = await workspaceKeyFromMaster(master);
    expect(mine.key.extractable).toBe(false);
    const sealed = await seal(mine.key, config, workspaceConfigAad(userId));
    expect(await open(mine.key, sealed, workspaceConfigAad(userId))).toEqual(config);
    await expect(open(mine.key, sealed, workspaceConfigAad("99999999-2222-4333-8444-555555555555"))).rejects.toThrow();
    await expect(openVaultPayload(generateEphemeralSecret(), vaultId, sealed)).rejects.toThrow();
  });

  it("commit accepts only ciphertext and refuses a raw secret or plaintext config", async () => {
    const secret = generateEphemeralSecret();
    const proof = await vaultClaimProof(secret);
    const { key: master } = newMasterKey();
    const mine = await workspaceKeyFromMaster(master);
    const base = {
      vault_id: vaultId,
      claim_proof: proof,
      name: "Studio Noord",
      encrypted_config: await seal(mine.key, config, workspaceConfigAad(vaultId)),
      key_id: mine.keyId,
    };
    expect(vaultCommitSchema.safeParse(base).success).toBe(true);
    expect(vaultCommitSchema.safeParse({ ...base, ephemeral_secret: secret }).success).toBe(false);
    expect(vaultCommitSchema.safeParse({ ...base, encrypted_config: JSON.stringify(config) }).success).toBe(false);
  });

  it("server-side vault code never touches the member's Master Key or device key", () => {
    for (const file of ["ephemeral-vault.server.ts", "ephemeral-vault.functions.ts", "ephemeral-vault.ts", "vault-hash.ts"]) {
      const src = readFileSync(`src/lib/vault/${file}`, "utf8");
      expect(src).not.toMatch(/e2ee\/(recovery|device-key)|masterKey|deriveDek/);
    }
    for (const route of ["api_.v1.agent.vault.ts", "api_.v1.workspaces.commit.ts"]) {
      const src = readFileSync(`src/routes/${route}`, "utf8");
      expect(src).not.toMatch(/e2ee\/(recovery|device-key)|masterKey|deriveDek/);
    }
  });
});
