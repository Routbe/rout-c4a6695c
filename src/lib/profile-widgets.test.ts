import { describe, expect, it } from "vitest";
import { daysUntilBirthday, musicEmbed, parseWidgetConfig, postEmbed, videoEmbed } from "./profile-widgets";
import { blockDisplay } from "./profile";

describe("profile widgets", () => {
  it("counts days to the next birthday, rolling to next year", () => {
    expect(daysUntilBirthday("1990-11-10", new Date(2026, 10, 4))).toBe(6);
    expect(daysUntilBirthday("1990-11-04", new Date(2026, 10, 4))).toBe(0);
    expect(daysUntilBirthday("1990-11-03", new Date(2026, 10, 4))).toBe(364);
  });

  it("stores only a city-level place (rounded coordinates)", () => {
    const c = parseWidgetConfig(JSON.stringify({ place: { name: "Gent", lat: 51.054342, lon: 3.717424, timezone: "Europe/Brussels" } }));
    expect(c.place).toEqual({ name: "Gent", lat: 51.05, lon: 3.72, timezone: "Europe/Brussels" });
  });

  it("turns single-post links into embeds", () => {
    expect(postEmbed("https://www.instagram.com/p/Cabc123/")).toEqual({ provider: "instagram", src: "https://www.instagram.com/p/Cabc123/embed" });
    expect(postEmbed("https://x.com/rout/status/123456")?.provider).toBe("x");
    expect(postEmbed("https://bsky.app/profile/rout.be/post/3kabc")).toEqual({ provider: "bluesky", handle: "rout.be", rkey: "3kabc" });
    expect(postEmbed("https://mastodon.social/@rout/11223344")?.provider).toBe("mastodon");
    expect(postEmbed("https://example.com/")).toBeNull();
  });

  it("embeds music and video links", () => {
    expect(musicEmbed("https://open.spotify.com/track/abc123")).toBe("https://open.spotify.com/embed/track/abc123");
    expect(videoEmbed("https://youtu.be/dQw4w9WgXcQ")?.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("a link can be a button, a logo under the bio, or both", () => {
    expect(blockDisplay({ display: "icon" }, "rows")).toEqual({ button: false, icon: true });
    expect(blockDisplay({ display: "both" }, "rows")).toEqual({ button: true, icon: true });
    expect(blockDisplay({}, "rows")).toEqual({ button: true, icon: false });
  });
});

describe("visual widget rules", () => {
  it("countdown: birthdays repeat yearly, events count down once", async () => {
    const { countdownDays } = await import("./profile-widgets");
    const now = new Date(2026, 10, 5);
    expect(countdownDays({ date: "1990-11-03" }, now)).toBe(363);
    expect(countdownDays({ date: "2026-11-03", mode: "event" }, now)).toBe(-2);
    expect(countdownDays({ date: "2026-12-25", mode: "event" }, now)).toBe(50);
    expect(countdownDays({}, now)).toBeNull();
  });

  it("validates widget links per kind", async () => {
    const { checkWidgetUrl } = await import("./profile-widgets");
    expect(checkWidgetUrl("wg_post", "")).toBe("empty");
    expect(checkWidgetUrl("wg_post", "http://x.com/a/status/1")).toBe("not_https");
    expect(checkWidgetUrl("wg_post", "https://x.com/a/status/1")).toBe("ok");
    expect(checkWidgetUrl("wg_music", "https://example.com/song")).toBe("unsupported");
    expect(checkWidgetUrl("wg_video", "https://vimeo.com/12345")).toBe("ok");
    expect(checkWidgetUrl("wg_photo", "https://i.imgur.com/a.webp")).toBe("ok");
    expect(checkWidgetUrl("wg_photo", "https://example.com/page")).toBe("unsupported");
  });

  it("a widget stays hidden until it has what it needs", async () => {
    const { isWidgetReady } = await import("./profile-widgets");
    expect(isWidgetReady("wg_weather", {})).toBe(false);
    expect(isWidgetReady("wg_clock", { place: { name: "Gent", lat: 51.05, lon: 3.72, timezone: "Europe/Brussels" } })).toBe(true);
    expect(isWidgetReady("wg_text", { text: "   " })).toBe(false);
    expect(isWidgetReady("wg_video", { url: "https://example.com" })).toBe(false);
  });

  it("one city is shared by weather, clock and map", async () => {
    const { applySharedPlace, sharedWidgetPlace, parseWidgetConfig } = await import("./profile-widgets");
    const gent = { name: "Gent", lat: 51.05, lon: 3.72, timezone: "Europe/Brussels" };
    const blocks = [
      { id: "a", kind: "wg_weather", value: "{}" },
      { id: "b", kind: "wg_clock", value: "{}" },
      { id: "c", kind: "wg_map", value: JSON.stringify({ place: { ...gent, name: "Leuven" }, zoom: 9 }) },
      { id: "d", kind: "wg_text", value: "{}" },
    ];
    const next = applySharedPlace(blocks, "a", gent);
    expect(parseWidgetConfig(next[0]!.value).place?.name).toBe("Gent");
    expect(parseWidgetConfig(next[1]!.value).place?.name).toBe("Gent");
    expect(parseWidgetConfig(next[2]!.value).place?.name).toBe("Leuven");
    expect(next[3]!.value).toBe("{}");
    expect(sharedWidgetPlace(next)?.name).toBe("Gent");
  });
});

describe("logo bar under the bio", () => {
  const link = (id: string, display?: "button" | "icon" | "both") => ({ id, kind: "website", label: id, value: `https://${id}.be`, ...(display ? { display } : {}) });

  it("counts only visible links shown as a logo", async () => {
    const { countLogoLinks } = await import("./profile");
    const blocks = [link("a", "icon"), link("b", "both"), link("c", "button"), { ...link("d", "icon"), hidden: true }, { id: "w", kind: "wg_weather", label: "", value: "{}" }];
    expect(countLogoLinks(blocks, "rows")).toBe(2);
    expect(countLogoLinks([link("a"), link("b")], "icons")).toBe(2);
    expect(countLogoLinks([link("a"), link("b")], "rows")).toBe(0);
  });

  it("hint from the 4th logo, wrap/scroll choice from the 6th", async () => {
    const { logoBarStage, logoBarLayout } = await import("./profile");
    expect(logoBarStage(3)).toBe("calm");
    expect(logoBarStage(4)).toBe("hint");
    expect(logoBarStage(5)).toBe("hint");
    expect(logoBarStage(6)).toBe("choose");
    expect(logoBarLayout(5, "scroll")).toBe("wrap");
    expect(logoBarLayout(6, "scroll")).toBe("scroll");
    expect(logoBarLayout(8, undefined)).toBe("wrap");
  });

  it("a link's own choice beats the profile default", async () => {
    const { effectiveLinkDisplay } = await import("./profile");
    expect(effectiveLinkDisplay({}, "rows")).toBe("button");
    expect(effectiveLinkDisplay({}, "icons")).toBe("icon");
    expect(effectiveLinkDisplay({ display: "both" }, "rows")).toBe("both");
  });
});
