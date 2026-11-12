export function hasUnpublishedDraft(draftRevision: number, publishedRevision: number): boolean {
  return draftRevision !== publishedRevision;
}

export function assertExpectedDraftRevision(current: number, expected: number): void {
  if (current !== expected) throw new Error("draft_conflict");
}

/** A synchronous lock: React state cannot serialize same-tick operations. */
export function createDraftOperationLock() {
  let active: "save" | "publish" | "discard" | null = null;
  return {
    acquire(operation: "save" | "publish" | "discard") {
      if (active !== null) return false;
      active = operation;
      return true;
    },
    release() { active = null; },
  };
}