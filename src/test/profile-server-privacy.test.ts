import { beforeEach, describe, expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/neon", () => ({ sql: query }));
import { readPublicProfile } from "@/lib/studio-profile.server";
import { findHandleForHost } from "@/lib/domains.server";

beforeEach(() => query.mockReset());
describe("public profile privacy at the server boundary", () => {
  it("never returns private content even if a profile row is found", async () => {
    query.mockResolvedValueOnce([{ id: "member", username: "anna", display_prefs: { publicProfile: false }, bio: "private" }]);
    expect(await readPublicProfile("anna")).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("keeps suspension and privacy guards on the fallback read", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    query.mockRejectedValueOnce(new Error("optional column missing")).mockResolvedValueOnce([]);
    expect(await readPublicProfile("anna")).toBeNull();
    const fallback = query.mock.calls[1][0].join("");
    expect(fallback).toContain("is_suspended");
    expect(fallback).toContain("is_banned");
    expect(fallback).toContain("publicProfile");
    vi.restoreAllMocks();
  });
  it("does not resolve an unknown or unpublished custom-domain profile", async () => {
    query.mockResolvedValueOnce([]);
    expect(await findHandleForHost("profile.example.com")).toBeNull();
    const statement = query.mock.calls[0][0].join("");
    expect(statement).toContain("d.status = 'verified'");
    expect(statement).toContain("publicProfile");
    expect(statement).toContain("is_suspended");
  });
});