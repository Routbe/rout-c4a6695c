import { describe, expect, it } from "vitest";
import { canUseDeveloperConsole } from "./console-access-rules";

describe("canUseDeveloperConsole", () => {
  it("allows a verified member", () => expect(canUseDeveloperConsole({ verified: true })).toBe(true));
  it("allows a Pro (paid) member", () => expect(canUseDeveloperConsole({ isPaid: true })).toBe(true));
  it("allows a claimed root handle", () =>
    expect(canUseDeveloperConsole({ hasClaimedRootHandle: true })).toBe(true));
  it("allows a full admin", () => expect(canUseDeveloperConsole({ isAdmin: true })).toBe(true));
  it("blocks a free alias without any signal", () => expect(canUseDeveloperConsole({})).toBe(false));
  it("blocks a banned verified member", () =>
    expect(canUseDeveloperConsole({ verified: true, isBanned: true })).toBe(false));
  it("blocks a suspended member", () =>
    expect(canUseDeveloperConsole({ isPaid: true, isSuspended: true })).toBe(false));
});
