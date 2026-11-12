import { describe, expect, it } from "vitest";
import {
  ENVELOPE_MAX_BYTES,
  ENVELOPE_MAX_PLAINTEXT,
  ENVELOPE_MIN_BYTES,
  EnvelopeError,
  EnvelopePolicyError,
  KIND_KEY_HOLDER,
  PUBLIC_KEY_BYTES,
  SECRET_KEY_BYTES,
  generateRecipientKeys,
  openEnvelope,
  sealEnvelope,
} from "./pqc-envelope";

const enc = new TextEncoder();
const iban = enc.encode("NL91ABNA0417164300");
const ctx = "rout.vault.v1|00000000-0000-4000-8000-00000000000a|iban";
const server = generateRecipientKeys("server_vault");

const seal = (plaintext = iban, context = ctx) =>
  sealEnvelope({ kind: "vtk", holder: "server_vault", recipientPublicKey: server.publicKey, plaintext, context });
const open = (envelope: Uint8Array, context = ctx, secretKey = server.secretKey) =>
  openEnvelope({ envelope, expectedKind: "vtk", holder: "server_vault", secretKey, context });

describe("RVE1 hybrid envelope", () => {
  it("uses ML-KEM-1024 + X25519 sized keys and a 32-byte secret seed", () => {
    expect(server.publicKey).toHaveLength(PUBLIC_KEY_BYTES);
    expect(server.secretKey).toHaveLength(SECRET_KEY_BYTES);
    expect(server.kid).toHaveLength(16);
  });

  it("round-trips and satisfies the database envelope check", () => {
    const envelope = seal();
    expect([...envelope.subarray(0, 4)]).toEqual([0x52, 0x56, 0x45, 0x31]);
    expect(envelope.length).toBeGreaterThanOrEqual(1600);
    expect(envelope.length).toBe(ENVELOPE_MIN_BYTES + iban.length);
    expect(new TextDecoder().decode(open(envelope))).toBe("NL91ABNA0417164300");
    expect(seal()).not.toEqual(envelope);
  });

  it("fixes the key holder per kind as the owner decided", () => {
    expect(KIND_KEY_HOLDER).toEqual({ vtk: "server_vault", vcc: "member_device", mpc: "shard_factor", sdm: "server_vault" });
    const device = generateRecipientKeys("member_device");
    expect(() =>
      sealEnvelope({ kind: "vcc", holder: "server_vault", recipientPublicKey: server.publicKey, plaintext: iban, context: ctx }),
    ).toThrow(EnvelopePolicyError);
    expect(() =>
      sealEnvelope({ kind: "mpc", holder: "server_vault", recipientPublicKey: server.publicKey, plaintext: iban, context: ctx }),
    ).toThrow(EnvelopePolicyError);
    const claim = sealEnvelope({ kind: "vcc", holder: "member_device", recipientPublicKey: device.publicKey, plaintext: iban, context: ctx });
    expect(() => openEnvelope({ envelope: claim, expectedKind: "vcc", holder: "server_vault", secretKey: server.secretKey, context: ctx })).toThrow(
      EnvelopePolicyError,
    );
    expect([...openEnvelope({ envelope: claim, expectedKind: "vcc", holder: "member_device", secretKey: device.secretKey, context: ctx })]).toEqual([...iban]);
    // A vcc envelope is never accepted where a vtk is expected.
    expect(() => open(claim)).toThrow(EnvelopeError);
  });

  it("rejects every single-byte tamper, in every region", () => {
    const envelope = seal();
    const positions = [0, 3, 4, 5, 6, 7, 22, 23, 500, 1590, 1622, 1623, 1646, 1647, envelope.length - 17, envelope.length - 1];
    for (const p of positions) {
      const t = envelope.slice();
      t[p] = (t[p] ?? 0) ^ 0x01;
      expect(() => open(t), `byte ${p}`).toThrow(EnvelopeError);
    }
  });

  it("is bound to its context and to its recipient key", () => {
    const envelope = seal();
    expect(() => open(envelope, "rout.vault.v1|00000000-0000-4000-8000-00000000000b|iban")).toThrow(EnvelopeError);
    expect(() => open(envelope, ctx, generateRecipientKeys("server_vault").secretKey)).toThrow(EnvelopeError);
  });

  it("fails generically on truncation, padding and garbage", () => {
    const envelope = seal();
    for (const bad of [envelope.subarray(0, ENVELOPE_MIN_BYTES - 1), new Uint8Array(ENVELOPE_MAX_BYTES + 1), new Uint8Array(4000), envelope.subarray(0, envelope.length - 1)]) {
      try {
        open(bad);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(EnvelopeError);
        expect((e as Error).message).toBe("envelope_invalid");
      }
    }
  });

  it("enforces size, context and public-key limits when sealing", () => {
    expect(() => seal(new Uint8Array(ENVELOPE_MAX_PLAINTEXT + 1))).toThrow(EnvelopePolicyError);
    expect(seal(new Uint8Array(ENVELOPE_MAX_PLAINTEXT)).length).toBe(ENVELOPE_MAX_BYTES);
    expect(() => seal(iban, "")).toThrow(EnvelopePolicyError);
    expect(() =>
      sealEnvelope({ kind: "vtk", holder: "server_vault", recipientPublicKey: new Uint8Array(32), plaintext: iban, context: ctx }),
    ).toThrow(EnvelopePolicyError);
    // Valid ML-KEM part with a low-order (all-zero) X25519 point.
    const lowOrder = server.publicKey.slice();
    lowOrder.fill(0, 1568);
    expect(() =>
      sealEnvelope({ kind: "vtk", holder: "server_vault", recipientPublicKey: lowOrder, plaintext: iban, context: ctx }),
    ).toThrow(EnvelopePolicyError);
  });
});
