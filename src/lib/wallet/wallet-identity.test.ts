import { describe, expect, it, vi } from "vitest";
import { walletCardPayload } from "./wallet-pass";

vi.mock("@/lib/neon", () => ({ sql: vi.fn(async () => [{ root: "jona", alias: null }]) }));

const input = (handle: string) => ({ handle, space: "root" as const, displayName: null, tagline: null, themeBg: null, avatarSrc: null });

describe("ROUT Card identifiers", () => {
  it("keeps the same pass serial when the handle changes", () => {
    const before = walletCardPayload(input("jona"), "https://rout.be", "ROUT-1", "abc123");
    const after = walletCardPayload(input("jona-new"), "https://rout.be", "ROUT-1", "abc123");
    expect(after.serial).toBe(before.serial);
    expect(before.serial).not.toContain("jona");
  });

  it("refuses an internal account id unless server code explicitly allows it", async () => {
    const { generateWalletPayload } = await import("./wallet-payload.server");
    await expect(generateWalletPayload("123e4567-e89b-12d3-a456-426614174000")).resolves.toBeNull();
  });
});
