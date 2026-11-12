import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { VAULT_PROOF_PATTERN } from "./ephemeral-vault";

/**
 * Step A of the zero-knowledge claim: a signed-in human proves knowledge of
 * the ephemeral secret with the one-way claim proof and receives only the
 * ciphertext. Decryption happens in the browser.
 */
export const openEphemeralVault = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.strictObject({ vaultId: z.uuid(), claimProof: z.string().regex(VAULT_PROOF_PATTERN) }).parse(d))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    enforceRateLimit(`vault-open:${context.userId}`, 10, 60_000);
    const { readVerifiedVault } = await import("./ephemeral-vault.server");
    try {
      const v = await readVerifiedVault(data.vaultId, data.claimProof);
      if (!v) return { status: "not_found" as const };
      return { status: "ok" as const, encryptedPayload: v.encryptedPayload, expiresAt: v.expiresAt };
    } catch (error) {
      if ((error as Error).message === "vault_proof_invalid") return { status: "invalid" as const };
      throw error;
    }
  });
