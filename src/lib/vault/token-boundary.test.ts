import { describe, expect, it } from "vitest";
import {
  AnyOpaqueTokenSchema,
  MultiPartyShardSchema,
  OPAQUE_TOKEN_INVALID,
  OPAQUE_TOKEN_LENGTH,
  OpaqueTokenError,
  SecureDynamicMessagingSchema,
  VaultTokenKeySchema,
  VerifiableCredentialClaimSchema,
  isOpaqueToken,
  opaqueTokenKind,
  parseOpaqueToken,
} from "./token-boundary";

const body = "0123456789abcdef".repeat(4);

describe("opaque token boundary", () => {
  it("accepts exactly the four prefixes with a 64-hex body", () => {
    for (const kind of ["vtk", "vcc", "mpc", "sdm"] as const) {
      const token = parseOpaqueToken(`${kind}_${body}`, kind);
      expect(token).toHaveLength(OPAQUE_TOKEN_LENGTH);
      expect(opaqueTokenKind(token)).toBe(kind);
    }
  });

  it("each kind's schema rejects the other kinds", () => {
    expect(VaultTokenKeySchema.safeParse(`vtk_${body}`).success).toBe(true);
    expect(VaultTokenKeySchema.safeParse(`vcc_${body}`).success).toBe(false);
    expect(VerifiableCredentialClaimSchema.safeParse(`mpc_${body}`).success).toBe(false);
    expect(MultiPartyShardSchema.safeParse(`sdm_${body}`).success).toBe(false);
    expect(SecureDynamicMessagingSchema.safeParse(`vtk_${body}`).success).toBe(false);
  });

  it("rejects unknown prefixes, case changes, padding, wrong lengths and non-strings", () => {
    const bad: unknown[] = [
      `abc_${body}`,
      `VTK_${body}`,
      `vtk_${body.toUpperCase()}`,
      ` vtk_${body}`,
      `vtk_${body}\n`,
      `vtk_${body.slice(1)}`,
      `vtk_${body}0`,
      `vtk-${body}`,
      `vtk_${body.slice(0, 63)}g`,
      `vtk_${body.slice(0, 63)}０`,
      "",
      null,
      undefined,
      42,
      { toString: () => `vtk_${body}` },
      "vtk_" + "a".repeat(10_000),
    ];
    for (const value of bad) {
      expect(isOpaqueToken(value)).toBe(false);
      expect(AnyOpaqueTokenSchema.safeParse(value).success).toBe(false);
      expect(() => parseOpaqueToken(value)).toThrow(OpaqueTokenError);
    }
  });

  it("never echoes the rejected input in errors", () => {
    const secretLooking = "NL91ABNA0417164300";
    const result = AnyOpaqueTokenSchema.safeParse(secretLooking);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).not.toContain(secretLooking);
    expect(result.error?.issues[0]?.message).toBe(OPAQUE_TOKEN_INVALID);
    try {
      parseOpaqueToken(secretLooking);
    } catch (e) {
      expect(String(e)).not.toContain(secretLooking);
    }
  });
});
