// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const spent = vi.hoisted(() => new Set<string>());
vi.mock("@/lib/better-auth.server", () => ({ resolveAuthSecret: () => ({ secret: "test-secret" }) }));
vi.mock("@/lib/audit-log.server", () => ({ recordSecurityEvent: vi.fn() }));
vi.mock("@/lib/wallet/card-freeze.server", () => ({
  useTokenNonce: async (n: string) => (spent.has(n) ? false : (spent.add(n), true)),
}));

import { hmacSha256Hex } from "@/lib/audit-chain";
import { allowedStepUpMethods, stepUpPayload, type StepUpAction, type StepUpMethod } from "./step-up-rules";
import { ensureStepUpProof, StepUpRequiredError } from "./step-up.server";

async function proof(method: StepUpMethod, scope: StepUpAction | "*", age = 0, userId = "u1") {
  const p = stepUpPayload(userId, method, Math.floor(Date.now() / 1000) - age, scope);
  return `${p}.${await hmacSha256Hex("stepup:test-secret", p)}`;
}

beforeEach(() => spent.clear());

describe("ROUT card step-up proofs", () => {
  it("work exactly once for a card action", async () => {
    const c = await proof("totp", "card_reveal");
    await expect(ensureStepUpProof("u1", "card_reveal", () => c)).resolves.toMatchObject({ method: "totp" });
    await expect(ensureStepUpProof("u1", "card_reveal", () => c)).rejects.toBeInstanceOf(StepUpRequiredError);
  });
  it("given to show the card never blocks or replaces it", async () => {
    const c = await proof("password", "card_reveal");
    await expect(ensureStepUpProof("u1", "card_lifecycle", () => c)).rejects.toBeInstanceOf(StepUpRequiredError);
  });
  it("a general authenticator-app proof does not open the card", async () => {
    const c = await proof("totp", "*");
    await expect(ensureStepUpProof("u1", "card_reveal", () => c)).rejects.toBeInstanceOf(StepUpRequiredError);
  });
  it("a passkey proof opens the card once", async () => {
    const c = await proof("passkey", "*");
    await expect(ensureStepUpProof("u1", "card_reveal", () => c)).resolves.toMatchObject({ method: "passkey" });
    await expect(ensureStepUpProof("u1", "card_lifecycle", () => c)).rejects.toBeInstanceOf(StepUpRequiredError);
  });
  it("is refused after 120 seconds", async () => {
    const c = await proof("totp", "card_reveal", 121);
    await expect(ensureStepUpProof("u1", "card_reveal", () => c)).rejects.toBeInstanceOf(StepUpRequiredError);
  });
  it("of another member is refused", async () => {
    const c = await proof("totp", "card_reveal", 0, "u2");
    await expect(ensureStepUpProof("u1", "card_reveal", () => c)).rejects.toBeInstanceOf(StepUpRequiredError);
  });
});

describe("scanning a ROUT card", () => {
  it("needs a real second factor: never a password or recovery code", () => {
    const all = { passkey: true, totp: true, sms: true, backup: true, password: true };
    expect(allowedStepUpMethods(all, "card_scan")).toEqual(["passkey", "totp", "sms"]);
    expect(allowedStepUpMethods({ passkey: false, totp: false, sms: false, password: true }, "card_scan")).toEqual([]);
  });
  it("a password proof given for scanning is refused", async () => {
    const c = await proof("password", "card_scan");
    await expect(ensureStepUpProof("u1", "card_scan", () => c)).rejects.toBeInstanceOf(StepUpRequiredError);
  });
  it("an SMS proof given for scanning works once", async () => {
    const c = await proof("sms", "card_scan");
    await expect(ensureStepUpProof("u1", "card_scan", () => c)).resolves.toMatchObject({ method: "sms" });
    await expect(ensureStepUpProof("u1", "card_scan", () => c)).rejects.toBeInstanceOf(StepUpRequiredError);
  });
});
