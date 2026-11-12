import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), token: vi.fn(), card: vi.fn() }));
vi.mock("@/lib/neon", () => ({ sql: { query: mocks.query } }));
vi.mock("./card-liveness.server", () => ({ livenessKey: async () => new Uint8Array(32) }));
vi.mock("./card-token", () => ({ verifySecureToken: mocks.token }));
vi.mock("./wallet-payload.server", () => ({ generateWalletPayload: mocks.card }));
import { cardStatus, validateCardActive, issueChallenge } from "./card-freeze.server";
import { cardTokenTag, verifySecureCardTokenCore, verdictHttpStatus } from "./card-verify.server";

beforeEach(async () => {
  mocks.query.mockReset();
  mocks.token.mockReset().mockResolvedValue({ ok: true, payload: { h: "owner", s: "r", c: await cardTokenTag("serial"), n: "nonce", exp: Date.now() + 60000 } });
  mocks.card.mockReset().mockResolvedValue({ serial: "serial", displayName: "Owner", heroImageUrl: null });
});
describe("fail-closed card authorization", () => {
  it("rejects a token of a replaced card (other card number) before any lookup", async () => {
    mocks.token.mockResolvedValue({ ok: true, payload: { h: "owner", s: "r", c: await cardTokenTag("old-serial"), n: "nonce", exp: Date.now() + 60000 } });
    mocks.query.mockResolvedValue([{ s: "active" }]);
    expect(await verifySecureCardTokenCore("signed-token")).toEqual({ status: "invalid" });
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each([undefined, null, "pending", "revoked", "unexpected"])("does not authorize status %s", async (s) => {
    mocks.query.mockResolvedValue([{ s }]);
    expect(await validateCardActive("serial")).toBe(false);
  });
  it("denies authentication when status storage is absent", async () => {
    mocks.query.mockRejectedValue(Object.assign(new Error("missing"), { code: "42P01" }));
    expect(await cardStatus("serial")).toBe("unavailable");
    expect(await verifySecureCardTokenCore("signed-token")).toEqual({ status: "frozen" });
  });
  it("rejects replay with 403", async () => {
    mocks.query.mockResolvedValueOnce([{ s: "active" }]).mockResolvedValueOnce([{ ok: false }]);
    const result = await verifySecureCardTokenCore("signed-token");
    expect(result).toEqual({ status: "replayed" });
    expect(verdictHttpStatus(result)).toBe(403);
  });
  it("rejects missing replay storage", async () => {
    mocks.query.mockResolvedValueOnce([{ s: "active" }]).mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "42P01" }));
    expect(await verifySecureCardTokenCore("signed-token")).toEqual({ status: "invalid" });
  });
  it("returns minimal public fields only after successful atomic consumption", async () => {
    mocks.query.mockResolvedValueOnce([{ s: "active" }]).mockResolvedValueOnce([{ ok: true }]);
    expect(await verifySecureCardTokenCore("signed-token")).toEqual({ status: "valid", display_name: "Owner", avatar_url: null, replay_protected: true });
  });
  it("refuses NFC challenge issuance for a pending key", async () => {
    mocks.query.mockResolvedValue([{ s: "pending" }]);
    expect(await issueChallenge("hardware-id", "nonce-hash")).toBe(false);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});