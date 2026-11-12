import { describe, expect, it } from "vitest";
import { resolveMediaEmbed } from "./media-embed-parser";

describe("resolveMediaEmbed — YouTube", () => {
  it("watch?v= URL", () => {
    const r = resolveMediaEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(r?.provider).toBe("youtube");
    expect(r?.kind).toBe("video");
    expect(r?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("youtu.be korte link", () => {
    expect(resolveMediaEmbed("https://youtu.be/dQw4w9WgXcQ")?.externalId).toBe("dQw4w9WgXcQ");
  });

  it("Shorts", () => {
    expect(resolveMediaEmbed("https://www.youtube.com/shorts/abc123XYZ_-")?.embedUrl).toBe(
      "https://www.youtube-nocookie.com/embed/abc123XYZ_-",
    );
  });

  it("zonder protocol", () => {
    expect(resolveMediaEmbed("youtube.com/watch?v=dQw4w9WgXcQ")?.provider).toBe("youtube");
  });
});

describe("resolveMediaEmbed — Spotify", () => {
  it("track", () => {
    const r = resolveMediaEmbed("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC");
    expect(r?.kind).toBe("audio");
    expect(r?.embedUrl).toBe("https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC");
  });

  it("album / playlist / episode", () => {
    expect(
      resolveMediaEmbed("https://open.spotify.com/album/1ATL5GLyefJaxhQzSPVrLX")?.embedUrl,
    ).toContain("/embed/album/");
    expect(
      resolveMediaEmbed("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")?.embedUrl,
    ).toContain("/embed/playlist/");
    expect(
      resolveMediaEmbed("https://open.spotify.com/episode/512ojhOuo1ktJprKbVcKyQ")?.embedUrl,
    ).toContain("/embed/episode/");
  });

  it("intl-locale prefix", () => {
    expect(
      resolveMediaEmbed("https://open.spotify.com/intl-nl/track/4uLU6hMCjMI75M1A2tKUQC")
        ?.externalId,
    ).toBe("4uLU6hMCjMI75M1A2tKUQC");
  });
});

describe("resolveMediaEmbed — SoundCloud / Apple / Vimeo / PDF", () => {
  it("soundcloud widget", () => {
    const r = resolveMediaEmbed("https://soundcloud.com/artist/track-name");
    expect(r?.provider).toBe("soundcloud");
    expect(r?.embedUrl).toContain("w.soundcloud.com/player/");
  });

  it("soundcloud root is geen embed", () => {
    expect(resolveMediaEmbed("https://soundcloud.com/")).toBeNull();
  });

  it("apple music", () => {
    const r = resolveMediaEmbed("https://music.apple.com/nl/album/example/12345");
    expect(r?.embedUrl).toContain("embed.music.apple.com");
  });

  it("vimeo", () => {
    expect(resolveMediaEmbed("https://vimeo.com/123456789")?.embedUrl).toBe(
      "https://player.vimeo.com/video/123456789",
    );
  });

  it("pdf-document", () => {
    const r = resolveMediaEmbed("https://example.com/files/portfolio.pdf");
    expect(r?.provider).toBe("pdf");
    expect(r?.kind).toBe("document");
  });
});

describe("resolveMediaEmbed — edge cases", () => {
  it("lege / ongeldige invoer", () => {
    expect(resolveMediaEmbed("")).toBeNull();
    expect(resolveMediaEmbed("   ")).toBeNull();
    expect(resolveMediaEmbed("not a url")).toBeNull();
    expect(resolveMediaEmbed("https://example.com/page")).toBeNull();
  });
});
