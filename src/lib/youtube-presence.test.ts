import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { effectivePresence, hubSecret, liveRedirectTarget, parseYouTubeFeed, verifyHubSignature } from "./youtube-presence";

const now = Date.parse("2026-10-31T12:00:00Z");
const live = { isLive: true, videoId: "abc123XYZ", title: "Stream" };

describe("YouTube presence", () => {
  it("is live within 15 minutes", () => expect(effectivePresence(live, new Date(now - 14 * 60_000), now).isLive).toBe(true));
  it("falls back to offline after 15 minutes", () => expect(effectivePresence(live, new Date(now - 16 * 60_000), now).isLive).toBe(false));
  it("missing timestamp is offline", () => expect(effectivePresence(live, null, now).isLive).toBe(false));
  it("/live goes to the stream while live and to the profile otherwise", () => {
    expect(liveRedirectTarget(live, "/u/a")).toBe("https://www.youtube.com/watch?v=abc123XYZ");
    expect(liveRedirectTarget({ ...live, isLive: false }, "/u/a")).toBe("/u/a");
  });
  it("parses a hub push", () => {
    const xml = `<feed><entry><yt:videoId>abc123XYZ</yt:videoId><yt:channelId>UCabcdefghijklmn</yt:channelId><title>Hi &amp; bye</title></entry></feed>`;
    expect(parseYouTubeFeed(xml)).toEqual([{ videoId: "abc123XYZ", channelId: "UCabcdefghijklmn", title: "Hi & bye" }]);
  });
  it("checks the hub signature", () => {
    const secret = hubSecret("s", "UCabcdefghijklmn");
    const body = "<feed/>";
    const sig = "sha1=" + createHmac("sha1", secret).update(body).digest("hex");
    expect(verifyHubSignature(body, sig, secret)).toBe(true);
    expect(verifyHubSignature(body + "x", sig, secret)).toBe(false);
    expect(verifyHubSignature(body, null, secret)).toBe(false);
  });
});
