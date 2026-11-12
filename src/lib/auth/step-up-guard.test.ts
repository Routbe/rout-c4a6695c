// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/better-auth.server", () => ({ resolveAuthSecret: () => ({ secret: "test-secret" }) }));
vi.mock("@/lib/audit-log.server", () => ({ recordSecurityEvent: vi.fn() }));
import { hmacSha256Hex } from "@/lib/audit-chain";
import { stepUpPayload } from "./step-up-rules";
import { requirePasskeyStepUp } from "./step-up-guard.server";
async function cookie(method: "passkey" | "totp" | "email", age = 0) {
  const p = stepUpPayload("u", method, Math.floor(Date.now() / 1000) - age);
  return `${p}.${await hmacSha256Hex("stepup:test-secret", p)}`;
}
describe("mandatory primary email passkey guard", () => {
  it("rejects missing proof before primary email change", async () => {
    await expect(requirePasskeyStepUp("u", "primary_email_change", () => undefined)).rejects.toThrow("STEP_UP_REQUIRED");
  });
  it.each(["email", "totp"] as const)("rejects even fresh %s proof for primary email", async (method) => {
    const c = await cookie(method);
    await expect(requirePasskeyStepUp("u", "primary_email_change", () => c)).rejects.toThrow("STEP_UP_REQUIRED");
  });
  it("requires passkey proof at most 120 seconds old", async () => {
    const fresh = await cookie("passkey", 120);
    const stale = await cookie("passkey", 121);
    await expect(requirePasskeyStepUp("u", "primary_email_change", () => fresh)).resolves.toBe("passkey");
    await expect(requirePasskeyStepUp("u", "primary_email_change", () => stale)).rejects.toThrow();
  });
  it("does not accept proof belonging to another user", async () => {
    const c = await cookie("passkey");
    await expect(requirePasskeyStepUp("other", "primary_email_change", () => c)).rejects.toThrow();
  });
});