import { agentError } from "@/lib/agent/responses";
import {
  POW_BITS,
  POW_CHALLENGE_HEADER,
  POW_CHALLENGE_TTL_S,
  POW_SOLUTION_HEADER,
  sha256Hex,
  signPowChallenge,
  verifyPow,
  type PowScope,
} from "./pow";

function powSecret(): string {
  const s = process.env["POW_SECRET"] || process.env["BETTER_AUTH_SECRET"];
  if (!s || s.length < 32) throw new Error("pow_secret_missing");
  return s;
}

export async function issuePowChallenge(scope: PowScope) {
  const challenge = await signPowChallenge(powSecret(), scope, Math.floor(Date.now() / 1000), crypto.getRandomValues(new Uint8Array(16)));
  return {
    challenge,
    scope,
    difficulty_bits: POW_BITS[scope],
    expires_in: POW_CHALLENGE_TTL_S,
    algorithm: "sha256(challenge + ':' + solution) must start with difficulty_bits zero bits; solution matches [0-9A-Za-z]{1,64}",
    send_as: { [POW_CHALLENGE_HEADER]: "<challenge>", [POW_SOLUTION_HEADER]: "<solution>" },
    single_use: true,
  };
}

function challengeRequired(scope: PowScope, reason: string, message: string): Response {
  const res = agentError(401, "challenge_required", message, {
    reason,
    challenge_url: `/api/v1/pow/challenge?scope=${scope}`,
    difficulty_bits: POW_BITS[scope],
  });
  res.headers.set("www-authenticate", `PoW realm="rout-agent", scope="${scope}", challenge_url="/api/v1/pow/challenge?scope=${scope}"`);
  return res;
}

/**
 * Gate for heavy agent operations. Step 1 (stateless) verifies the signature and
 * the work; call `spend()` after the caller is authenticated to burn the
 * challenge atomically (a replay returns the 401 Response instead).
 */
export async function requirePow(request: Request, scope: PowScope): Promise<Response | { spend: () => Promise<Response | null> }> {
  const challenge = request.headers.get(POW_CHALLENGE_HEADER)?.trim() ?? "";
  const solution = request.headers.get(POW_SOLUTION_HEADER)?.trim() ?? "";
  let check;
  try {
    check = await verifyPow(powSecret(), scope, challenge, solution, Math.floor(Date.now() / 1000));
  } catch {
    return agentError(503, "server_error", "Proof-of-work is not configured on this server.");
  }
  if (!check.ok) {
    const msg: Record<typeof check.reason, string> = {
      missing: `This operation requires proof-of-work. GET /api/v1/pow/challenge?scope=${scope}, solve it, and send ${POW_CHALLENGE_HEADER} + ${POW_SOLUTION_HEADER}.`,
      invalid: "The proof-of-work challenge is malformed or was not issued by this server.",
      wrong_scope: `This challenge was issued for another operation. Request one with scope=${scope}.`,
      expired: "The proof-of-work challenge expired. Fetch a new one.",
      weak: "The solution does not meet the required difficulty.",
    };
    return challengeRequired(scope, check.reason, msg[check.reason]);
  }
  const expiresAt = new Date(check.expiresAt * 1000).toISOString();
  return {
    spend: async () => {
      const { sql } = await import("@/lib/neon");
      const rows = (await sql`select public.rout_pow_spend(${await sha256Hex(challenge)}, ${scope}, ${expiresAt}::timestamptz) as ok`) as Array<{ ok: boolean }>;
      return rows[0]?.ok ? null : challengeRequired(scope, "spent", "This challenge was already used. Every heavy request needs a fresh one.");
    },
  };
}
