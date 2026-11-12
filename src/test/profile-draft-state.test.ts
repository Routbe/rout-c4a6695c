import { describe, expect, it } from "vitest";
import { assertExpectedDraftRevision, createDraftOperationLock, hasUnpublishedDraft } from "@/lib/profile-draft-state";

describe("profile draft publication rules", () => {
  it("serializes save, discard and publish even before a render", () => {
    const lock = createDraftOperationLock();
    expect(lock.acquire("save")).toBe(true);
    expect(lock.acquire("save")).toBe(false);
    expect(lock.acquire("discard")).toBe(false);
    expect(lock.acquire("publish")).toBe(false);
    lock.release();
    expect(lock.acquire("discard")).toBe(true);
    expect(lock.acquire("publish")).toBe(false);
    lock.release();
    expect(lock.acquire("publish")).toBe(true);
  });
  it("keeps a newer draft unpublished until its revision is published", () => {
    expect(hasUnpublishedDraft(4, 3)).toBe(true);
    expect(hasUnpublishedDraft(4, 4)).toBe(false);
  });

  it("rejects a stale tab revision instead of overwriting a newer draft", () => {
    expect(() => assertExpectedDraftRevision(7, 6)).toThrowError("draft_conflict");
    expect(() => assertExpectedDraftRevision(7, 7)).not.toThrow();
  });
});