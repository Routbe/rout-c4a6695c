import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { CLAIM_TOKEN_PATTERN, hashClaimToken } from "./agent-claims";
import { claimCodeHashInput, normalizeClaimCode, sha256Hex } from "./agent-sandbox";

/** A claim link token (64 hex) or a typed claim code (ROUT-…). Exactly one. */
const claimInput = z.union([
  z.strictObject({ token: z.string().regex(CLAIM_TOKEN_PATTERN, "invalid claim token") }),
  z.strictObject({ code: z.string().max(80) }),
]);

async function claimHash(d: z.infer<typeof claimInput>): Promise<string> {
  if ("token" in d) return hashClaimToken(d.token);
  const normalized = normalizeClaimCode(d.code);
  if (!normalized) throw new Error("claim_code_invalid");
  return sha256Hex(claimCodeHashInput(normalized));
}

/** The secret itself (only in memory) unwraps the agent's sealed design. */
function claimSecret(d: z.infer<typeof claimInput>): { purpose: "token" | "code"; value: string } {
  if ("token" in d) return { purpose: "token", value: d.token };
  const normalized = normalizeClaimCode(d.code);
  if (!normalized) throw new Error("claim_code_invalid");
  return { purpose: "code", value: normalized };
}

/** Claim-page preview. Signed-in humans only; the hash never leaves the server. */
export const previewAgentWorkspaceClaim = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => claimInput.parse(d))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    enforceRateLimit(`agent-claim-preview:${context.userId}`, 20, 60_000);
    const { previewAgentClaim } = await import("./agent-workspaces.server");
    return previewAgentClaim(context.userId, await claimHash(data));
  });

/** The merge: claimer becomes Owner, the secret is destroyed, staging ends, login apps go live. */
export const claimAgentWorkspace = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => claimInput.parse(d))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("@/lib/rate-limit.server");
    enforceRateLimit(`agent-claim:${context.userId}`, 10, 60_000);
    const { claimAgentWorkspace: claim, recoverSealedAgentDraft } = await import("./agent-workspaces.server");
    const secret = claimSecret(data);
    try {
      return await claim(context.userId, await claimHash(data), secret);
    } catch (error) {
      // Already claimed by this member but the handoff was interrupted: finish opening the design.
      if (!/claim_used/.test((error as Error)?.message ?? "")) throw error;
      const recovered = await recoverSealedAgentDraft(context.userId, secret);
      if (!recovered) throw error;
      return { ...recovered, apps: [], draftRestored: true };
    }
  });
