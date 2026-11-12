import { describe, expect, it } from "vitest";
import { accessPayload, parseAccessPayload } from "./card-token";

const token = "eyJ2IjoyfQ." + "a".repeat(43);

describe("payment/access QR payload", () => {
  it("is never a web link", () => {
    expect(accessPayload(token).startsWith("rout:access:")).toBe(true);
    expect(accessPayload(token)).not.toMatch(/https?:|rout\.be/);
  });
  it("round-trips", () => {
    expect(parseAccessPayload(accessPayload(token))).toEqual({ ok: true, token });
  });
  it("refuses profile and web URLs", () => {
    expect(parseAccessPayload("https://rout.be/jan")).toEqual({ ok: false, reason: "web_url" });
    expect(parseAccessPayload("rout.be/jan/1234")).toEqual({ ok: false, reason: "web_url" });
    expect(parseAccessPayload(`https://rout.be/s/${token}`)).toEqual({ ok: false, reason: "web_url" });
  });
  it("refuses a bare token without prefix", () => {
    expect(parseAccessPayload(token).ok).toBe(false);
  });
});
