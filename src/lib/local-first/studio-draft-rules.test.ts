import { describe, expect, it } from "vitest";
import { draftFingerprint, isUnreachableSaveError, localDraftOffer, saveIndicator, studioDraftKey, STUDIO_DRAFT_MAX_AGE_MS } from "./studio-draft-rules";

describe("studio on-device drafts", () => {
  it("keeps personal, alias and each workspace draft apart", () => {
    expect(studioDraftKey("u1", "verified")).toBe("u1:verified");
    expect(studioDraftKey("u1", "alias")).toBe("u1:alias");
    expect(studioDraftKey("u1", "workspace", "w9")).toBe("u1:workspace:w9");
    expect(studioDraftKey("u1", "workspace", null)).toBeNull();
  });

  it("shows orange 'only on this device' when ROUT is unreachable but the latest edit is stored locally", () => {
    expect(saveIndicator({ saving: false, dirty: true, failed: true, unreachable: true, localSavedRev: 4, editRev: 4, savedAt: null })).toBe("device-only");
  });

  it("keeps a rejected edit red even when it is stored locally", () => {
    expect(saveIndicator({ saving: false, dirty: true, failed: true, unreachable: false, localSavedRev: 4, editRev: 4, savedAt: null })).toBe("not-saved");
    expect(isUnreachableSaveError("network")).toBe(true);
    expect(isUnreachableSaveError("validation_failed")).toBe(false);
  });

  it("shows red 'not saved' when the latest edit is not yet stored on the device either", () => {
    expect(saveIndicator({ saving: false, dirty: true, failed: true, unreachable: true, localSavedRev: 3, editRev: 4, savedAt: null })).toBe("not-saved");
  });

  it("offers to restore a recent local copy that differs from ROUT", () => {
    const now = 1_000_000_000;
    expect(localDraftOffer({ savedAt: now - 60_000, fingerprint: "a" }, "b", now)).toBe("restore");
    expect(localDraftOffer({ savedAt: now - 60_000, fingerprint: "b" }, "b", now)).toBe("discard");
    expect(localDraftOffer({ savedAt: now - STUDIO_DRAFT_MAX_AGE_MS - 1, fingerprint: "a" }, "b", now)).toBe("discard");
  });

  it("fingerprints drafts independent of key order", () => {
    expect(draftFingerprint({ a: 1, b: { c: 2, d: 3 } })).toBe(draftFingerprint({ b: { d: 3, c: 2 }, a: 1 }));
  });
});
