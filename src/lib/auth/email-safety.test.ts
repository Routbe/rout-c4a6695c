// @vitest-environment node
import { expect, it, vi } from "vitest";
import { EMAIL_RECOVERY_HOURS, EMAIL_RECOVERY_MS, recoveryWindowOpen } from "./email-safety";
vi.mock("./step-up-guard.server", () => ({ requirePasskeyStepUp: vi.fn().mockRejectedValue(new Error("STEP_UP_REQUIRED")) }));
it("preserves exactly 48 hours of old-address emergency recovery", () => {
  expect(EMAIL_RECOVERY_HOURS).toBe(48);
  expect(EMAIL_RECOVERY_MS).toBe(172800000);
  expect(recoveryWindowOpen(1000,1000+172799999)).toBe(true);
  expect(recoveryWindowOpen(1000,1000+172800000)).toBe(false);
});
it("primary email mutation rejects without passkey before database or mail access", async () => {
  const { requestPrimaryEmailChange } = await import("./email-safety.server");
  await expect(requestPrimaryEmailChange("u","next@example.com")).rejects.toThrow("STEP_UP_REQUIRED");
});
it("confirmation cannot bypass fresh passkey enforcement", async () => {
  const { confirmPrimaryEmailChange } = await import("./email-safety.server");
  await expect(confirmPrimaryEmailChange("u","token")).rejects.toThrow("STEP_UP_REQUIRED");
});