import { describe, expect, it, vi } from "vitest";
import { formatCount } from "@/lib/youtube-format";
import { GOOGLE_LIMITED_USE } from "@/lib/legal-constants";

const queries: string[] = [];
let rows: Record<string, unknown>[] = [];
vi.mock("@/lib/neon", () => ({
  sql: (s: TemplateStringsArray) => {
    queries.push(s.join("?").replace(/\s+/g, " ").trim());
    return Promise.resolve(rows);
  },
  hasDatabase: () => true,
}));
process.env["GOOGLE_CLIENT_ID"] = "cid";
process.env["GOOGLE_CLIENT_SECRET"] = "sec";
process.env["PSP_ENCRYPTION_KEY"] = "k".repeat(40);
const y = await import("@/lib/youtube.server");

describe("youtube count format", () => {
  it("formats thousands and millions", () => {
    expect(formatCount(950)).toBe("950");
    expect(formatCount(1200)).toBe("1.2K");
    expect(formatCount(3_400_000)).toBe("3.4M");
  });
});

describe("youtube vault", () => {
  it("requests youtube.readonly offline with consent", () => {
    const url = new URL(y.youtubeAuthorizeUrl("u1", "https://rout.be"));
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/youtube.readonly");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("rejects a tampered state", () => {
    const s = y.signYouTubeState("u1");
    expect(y.verifyYouTubeState(s)).toBe("u1");
    expect(y.verifyYouTubeState(s.replace("u1", "u2"))).toBeNull();
  });

  it("disconnect physically deletes the youtube row", async () => {
    rows = [];
    queries.length = 0;
    await y.disconnectYouTube("u1");
    expect(queries.some((q) => q.startsWith("delete from public.user_integrations") && q.includes("'youtube'"))).toBe(true);
  });

  it("marks the link disconnected when the refresh fails", async () => {
    rows = [{ access_token_enc: "x", access_token_iv: "y", refresh_token_enc: null, token_expires_at: "2000-01-01T00:00:00Z", connection_status: "connected" }];
    queries.length = 0;
    const token = await y.youtubeAccessToken("u1");
    expect(token).toBeNull();
    expect(queries.some((q) => q.includes("connection_status = 'disconnected'"))).toBe(true);
  });
});

describe("privacy policy", () => {
  it("contains Google's exact Limited Use sentence", () => {
    expect(GOOGLE_LIMITED_USE).toBe(
      "ROUT's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
    );
  });
});
