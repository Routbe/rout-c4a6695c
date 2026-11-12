import { describe, expect, it } from "vitest";
import {
  AUDIO_BLOCK_LIMITS,
  isAudioBlockUrl,
  normalizeAudioBlockUrl,
  parseAudioBlockConfig,
  serializeAudioBlockConfig,
} from "./audio-block";

describe("audio block urls", () => {
  it("accepts https URLs and bare hosts", () => {
    expect(isAudioBlockUrl("https://cdn.example.com/intro.mp3")).toBe(true);
    expect(isAudioBlockUrl("cdn.example.com/intro.mp3")).toBe(true);
  });
  it("rejects unsafe schemes and garbage", () => {
    expect(isAudioBlockUrl("javascript:alert(1)")).toBe(false);
    expect(isAudioBlockUrl("data:audio/mpeg;base64,AAAA")).toBe(false);
    expect(isAudioBlockUrl("http://insecure.example.com/x.mp3")).toBe(false);
    expect(isAudioBlockUrl("")).toBe(false);
    expect(isAudioBlockUrl("x".repeat(501))).toBe(false);
  });
  it("normalizes bare hosts to https", () => {
    expect(normalizeAudioBlockUrl("cdn.example.com/intro.mp3")).toBe("https://cdn.example.com/intro.mp3");
    expect(normalizeAudioBlockUrl("javascript:alert(1)")).toBe("");
  });
});

describe("audio block config", () => {
  it("round-trips url, caption and transcript", () => {
    const config = { url: "https://cdn.example.com/intro.mp3", caption: "Introductie", transcript: "Hallo, wij zijn…" };
    expect(parseAudioBlockConfig(serializeAudioBlockConfig(config))).toEqual(config);
  });
  it("stored garbage reads as an empty block", () => {
    expect(parseAudioBlockConfig("nope").url).toBe("");
    expect(parseAudioBlockConfig(null).caption).toBe("");
    expect(parseAudioBlockConfig('{"url": 42}').url).toBe("");
  });
  it("caps fields at their limits", () => {
    const config = parseAudioBlockConfig(
      JSON.stringify({ url: "u".repeat(600), caption: "c".repeat(200), transcript: "t".repeat(3000) }),
    );
    expect(config.url.length).toBe(AUDIO_BLOCK_LIMITS.url);
    expect(config.caption.length).toBe(AUDIO_BLOCK_LIMITS.caption);
    expect(config.transcript.length).toBe(AUDIO_BLOCK_LIMITS.transcript);
  });
});
