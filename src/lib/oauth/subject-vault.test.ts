import { describe, expect, it } from "vitest";
import { CURRENT_SUBJECT_VERSION, scopedSubject, sectorFor, subjectInfo } from "./subject-vault";

const M = "m".repeat(64);
const U = "123e4567-e89b-12d3-a456-426614174000";

describe("scoped subject vault", () => {
  it("never contains the account id and is 43 url-safe characters", async () => {
    const s = await scopedSubject(M, CURRENT_SUBJECT_VERSION, "client:app-a", U);
    expect(s).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(s).not.toContain(U);
    expect(s).not.toContain(U.replace(/-/g, ""));
  });

  it("differs per app, per key version and per master key, and is stable otherwise", async () => {
    const a = await scopedSubject(M, 2, "client:app-a", U);
    expect(await scopedSubject(M, 2, "client:app-a", U)).toBe(a);
    expect(await scopedSubject(M, 2, "client:app-b", U)).not.toBe(a);
    expect(await scopedSubject(M, 3, "client:app-a", U)).not.toBe(a);
    expect(await scopedSubject("n".repeat(64), 2, "client:app-a", U)).not.toBe(a);
  });

  it("length-encodes the sector so no two (version, sector) pairs share key input", () => {
    expect(subjectInfo(2, "client:ab")).toBe("v2|9:client:ab");
    expect(subjectInfo(2, "ab")).not.toBe(subjectInfo(22, "b"));
  });

  it("groups pairwise apps by verified host and keeps other apps separate", () => {
    expect(sectorFor({ clientId: "x", subjectType: "pairwise", sectorId: "App.Example" })).toBe("host:app.example");
    expect(sectorFor({ clientId: "x", subjectType: "public", sectorId: null })).toBe("client:x");
  });

  it("refuses to run without a real master key or with a non-uuid id", async () => {
    await expect(scopedSubject("short", 2, "client:a", U)).rejects.toThrow();
    await expect(scopedSubject(M, 2, "client:a", "user-1")).rejects.toThrow();
  });
});
