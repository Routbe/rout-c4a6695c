import { describe, expect, it } from "vitest";
import { needsStepUp, shareRichIdentity, stepUpCodeState, STRICT_ACR } from "./step-up";
import { redirectError } from "./redirect-rules";

describe("strict step-up", () => {
  it("seamless without hints needs no code", () => expect(needsStepUp({ flowPreference: "seamless" })).toBe(false));
  it("strict app always needs a code", () => expect(needsStepUp({ flowPreference: "strict" })).toBe(true));
  it("prompt=login triggers", () => expect(needsStepUp({ flowPreference: "seamless", prompt: "consent login" })).toBe(true));
  it("max_age triggers", () => expect(needsStepUp({ flowPreference: "seamless", maxAge: "0" })).toBe(true));
  it("strict acr triggers", () => expect(needsStepUp({ flowPreference: "seamless", acrValues: `x ${STRICT_ACR}` })).toBe(true));
  it("other acr does not", () => expect(needsStepUp({ flowPreference: "seamless", acrValues: "urn:other" })).toBe(false));
  it("code states", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const later = "2026-01-01T00:05:00Z";
    expect(stepUpCodeState(null, now)).toBe("missing");
    expect(stepUpCodeState({ attempts: 0, expiresAt: "2025-12-31T23:59:00Z", matches: true }, now)).toBe("expired");
    expect(stepUpCodeState({ attempts: 5, expiresAt: later, matches: true }, now)).toBe("locked");
    expect(stepUpCodeState({ attempts: 1, expiresAt: later, matches: false }, now)).toBe("wrong");
    expect(stepUpCodeState({ attempts: 1, expiresAt: later, matches: true }, now)).toBe("ok");
  });
});

describe("rich identity", () => {
  it("needs both app and user opt-in", () => {
    expect(shareRichIdentity(true, true)).toBe(true);
    expect(shareRichIdentity(true, false)).toBe(false);
    expect(shareRichIdentity(false, true)).toBe(false);
  });
});

describe("redirect validation", () => {
  it("accepts https and localhost http", () => {
    expect(redirectError("https://app.be/cb", [])).toBeNull();
    expect(redirectError("http://localhost:3000/cb", [])).toBeNull();
  });
  it("rejects http, fragments, duplicates, garbage", () => {
    expect(redirectError("http://app.be/cb", [])).not.toBeNull();
    expect(redirectError("https://app.be/cb#x", [])).not.toBeNull();
    expect(redirectError("https://app.be/cb", ["https://app.be/cb"])).not.toBeNull();
    expect(redirectError("nope", [])).not.toBeNull();
  });
});
