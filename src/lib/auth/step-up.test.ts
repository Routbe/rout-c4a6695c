import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/better-auth.server", () => ({ resolveAuthSecret: () => ({ secret: "test-secret" }) }));
vi.mock("@/lib/audit-log.server", () => ({ recordSecurityEvent: vi.fn() }));

import { allowedStepUpMethods, checkStepUpPayload, stepUpPayload, STEP_UP_MAX_AGE_SEC } from "./step-up-rules";
import { ensureStepUpSession, StepUpRequiredError } from "./step-up.server";
import { hmacSha256Hex } from "@/lib/audit-chain";

const actions = ["vault_export", "account_delete", "oauth_secret", "workspace_role"] as const;

async function cookieFor(userId: string, ageSec: number) {
  const p = stepUpPayload(userId, "passkey", Math.floor(Date.now() / 1000) - ageSec);
  return `${p}.${await hmacSha256Hex("stepup:test-secret", p)}`;
}

describe("step-up guard", () => {
  for (const action of actions) {
    it(`blocks ${action} without a step-up`, async () => {
      await expect(ensureStepUpSession("u1", action, () => undefined)).rejects.toBeInstanceOf(StepUpRequiredError);
    });
    it(`blocks ${action} when the step-up is older than 120 s`, async () => {
      const c = await cookieFor("u1", 121);
      await expect(ensureStepUpSession("u1", action, () => c)).rejects.toBeInstanceOf(StepUpRequiredError);
    });
  }
  it("allows a fresh step-up of the same user", async () => {
    const c = await cookieFor("u1", 10);
    await expect(ensureStepUpSession("u1", "vault_export", () => c)).resolves.toBe("passkey");
  });
  it("rejects another user's step-up", async () => {
    const c = await cookieFor("u2", 10);
    await expect(ensureStepUpSession("u1", "vault_export", () => c)).rejects.toBeInstanceOf(StepUpRequiredError);
  });
  it("max age is 120 s", () => {
    expect(STEP_UP_MAX_AGE_SEC).toBe(120);
    expect(checkStepUpPayload(stepUpPayload("u", "totp", 1000), "u", 1120)).toBe("totp");
    expect(checkStepUpPayload(stepUpPayload("u", "totp", 1000), "u", 1121)).toBeNull();
  });
  it("email only when no passkey/TOTP is enrolled", () => {
    expect(allowedStepUpMethods({ passkey: false, totp: false })).toEqual(["email"]);
    expect(allowedStepUpMethods({ passkey: true, totp: true })).toEqual(["passkey", "totp"]);
    expect(allowedStepUpMethods({ passkey: false, totp: true })).not.toContain("email");
  });
});
