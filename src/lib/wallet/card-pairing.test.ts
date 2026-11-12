import { describe, expect, it } from "vitest";
import { canPairFactoryKey, readHardwareId } from "./card-pairing";

describe("factory/client split", () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  const key = { status: "pending", userId: null, publicKey: "factory-public-key", activationMatches: true };
  it("reads only the factory hardware UUID", () => {
    expect(readHardwareId(`rout-hw:${id}`)).toBe(id);
    expect(readHardwareId("rout-pk:Ed25519:untrusted-key")).toBeNull();
  });
  it("requires a factory-installed public key", () => {
    expect(canPairFactoryKey(key)).toBe(true);
    expect(canPairFactoryKey({ ...key, publicKey: null })).toBe(false);
  });
  it("does not treat a public hardware ID as ownership proof", () => {
    expect(canPairFactoryKey({ ...key, activationMatches: false })).toBe(false);
  });
  it("cannot claim an already owned or revoked key", () => {
    expect(canPairFactoryKey({ ...key, userId: "another-owner" })).toBe(false);
    expect(canPairFactoryKey({ ...key, status: "revoked" })).toBe(false);
  });
});