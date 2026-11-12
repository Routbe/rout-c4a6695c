import { describe, expect, it } from "vitest";
import { needsNudge } from "@/lib/qa/nudge";
import { acceptRewrite, buildRewritePrompt, cleanModelOutput, detectInputLanguage, guessLanguage, neutralizeStyle, resolveSovereignEndpoint, REWRITE_RATE, STYLE_MASK_SYSTEM_PROMPT } from "@/lib/qa/style-mask";
import { nextDiceIndex, promptHeadline, resolvePromptKey, storedPromptLabel } from "@/lib/qa/prompts";
import { activeStories, hasUnseen, QA_STORY_HOURS, type QaAnswer } from "@/lib/qa/story";
import { QUESTION_RATE } from "@/lib/questions-rules";
import { wrapText, STORY_H, STORY_W } from "@/lib/qa/story-card";

describe("pre-send nudge", () => {
  it("warns on unkind words in each language", () => {
    expect(needsNudge("je bent een kankerlijer")).toBe(true);
    expect(needsNudge("you are such a loser")).toBe(true);
    expect(needsNudge("espèce de connard")).toBe(true);
    expect(needsNudge("du Hurensohn")).toBe(true);
  });
  it("sees through leetspeak and stretched letters", () => {
    expect(needsNudge("k*u*t")).toBe(true);
    expect(needsNudge("fuuuuck")).toBe(true);
    expect(needsNudge("l0s3r")).toBe(true);
  });
  it("stays quiet on friendly messages and words that only contain a trigger", () => {
    expect(needsNudge("Wat is je favoriete film?")).toBe(false);
    expect(needsNudge("Ik vind je echt lief")).toBe(false);
    expect(needsNudge("Scunthorpe is a town")).toBe(false);
    expect(needsNudge("")).toBe(false);
  });
});

describe("ghost mode (stylometry masking)", () => {
  it("removes emojis, fillers, stretched letters and shouting", () => {
    expect(neutralizeStyle("heeeel leuk lol 😂😂!!!")).toBe("Heel leuk!");
    expect(neutralizeStyle("WAAROM doe je dat")).toBe("Waarom doe je dat?");
  });
  it("expands chat shorthand", () => {
    expect(neutralizeStyle("idk wss morgen")).toBe("Ik weet het niet waarschijnlijk morgen.");
  });
  it("allows at most 3 magic-wand rewrites per minute per IP", () => {
    expect(REWRITE_RATE).toEqual({ limit: 3, windowSec: 60 });
  });
  it("keeps the input's own language and never forces Dutch", () => {
    expect(STYLE_MASK_SYSTEM_PROMPT).toContain("in THAT EXACT SAME LANGUAGE");
    expect(STYLE_MASK_SYSTEM_PROMPT).toContain("DO NOT translate the text to another language.");
    expect(STYLE_MASK_SYSTEM_PROMPT).not.toContain("Standaardnederlands");
  });
  it("adds the UI-language tie-breaker only when the draft's language is ambiguous", () => {
    const hint = "The user is currently browsing the site in fr. If the input language is ambiguous, default to standardizing it in fr.";
    expect(buildRewritePrompt("fr", "ok 😂😂")).toContain(hint);
    expect(buildRewritePrompt("nl", "yo bro why u ain't tell me that")).not.toContain("browsing the site");
    expect(buildRewritePrompt("xx", "ok")).not.toContain("browsing the site");
  });
  it("detects clear French, English, German and Dutch drafts", () => {
    expect(detectInputLanguage("wsh frérot pk t’as pas dit ça à moi")).toBe("fr");
    expect(detectInputLanguage("yo bro why u ain't tell me that")).toBe("en");
    expect(detectInputLanguage("alter warum hast du mir das nich gesagt")).toBe("de");
    expect(detectInputLanguage("waarom zegde ge da nie tegen mij")).toBe("nl");
    expect(detectInputLanguage("ok")).toBeNull();
  });
  it("rejects a rewrite that translated the draft or became a reply", () => {
    expect(acceptRewrite("yo bro why u ain't tell me that", "Waarom heb je dat niet tegen me gezegd?")).toBe(false);
    expect(acceptRewrite("yo bro why u ain't tell me that", "Why didn't you tell me that?")).toBe(true);
    expect(acceptRewrite("ok", "Je ne comprends pas votre demande. Veuillez reformuler votre message.")).toBe(false);
  });
  it("offline fallback keeps French and English instead of turning them Dutch", () => {
    expect(guessLanguage("slt pk tu dis ça mdr", "nl")).toBe("fr");
    expect(guessLanguage("idk why u r like this", "nl")).toBe("en");
    expect(neutralizeStyle("slt pk tu dis ça mdr 😂", "nl")).toBe("Salut pourquoi tu dis ça.");
    expect(neutralizeStyle("idk why u r like this lol", "nl")).toBe("I don't know why you are like this.");
  });
  it("builds the Swiss Infomaniak endpoint from the product id", () => {
    const e = resolveSovereignEndpoint({ productId: "105139" });
    expect(e?.url).toBe("https://api.infomaniak.com/2/ai/105139/openai/v1/chat/completions");
    expect(e?.infomaniak).toBe(true);
  });
  it("accepts any custom https endpoint and model, never plain http", () => {
    const e = resolveSovereignEndpoint({ baseUrl: "https://llm.example.eu/v1/", model: "mixtral", productId: "1" });
    expect(e?.url).toBe("https://llm.example.eu/v1/chat/completions");
    expect(e?.models).toEqual(["mixtral"]);
    expect(e?.infomaniak).toBe(false);
    expect(resolveSovereignEndpoint({ baseUrl: "http://llm.example.eu/v1" })).toBeNull();
    expect(resolveSovereignEndpoint({ productId: "abc" })).toBeNull();
  });
  it("strips quotes and labels from model output and enforces the length", () => {
    expect(cleanModelOutput('"Herschreven tekst: Hallo daar."', 300)).toBe("Hallo daar.");
    expect(cleanModelOutput("x".repeat(400), 300)).toHaveLength(300);
    expect(cleanModelOutput("", 300)).toBeNull();
    expect(cleanModelOutput("<think>plan</think> Hallo.", 300)).toBe("Hallo.");
  });
});

describe("prompts", () => {
  const t = (k: string) => `T:${k}`;
  it("falls back to the default prompt", () => {
    expect(resolvePromptKey("nope")).toBe("anything");
    expect(promptHeadline("custom", "   ", t)).toBe("T:pages.qa.prompt.anything");
    expect(promptHeadline("custom", "Wat is je droom?", t)).toBe("Wat is je droom?");
    expect(promptHeadline("honest", null, t)).toBe("T:pages.qa.prompt.honest");
  });
  it("labels stored prompts", () => {
    expect(storedPromptLabel("confess", t)).toBe("T:pages.qa.prompt.confess");
    expect(storedPromptLabel("Mijn eigen vraag", t)).toBe("Mijn eigen vraag");
  });
  it("the dice never repeats the previous idea", () => {
    expect(nextDiceIndex(3, 3 / 16)).not.toBe(3);
  });
});

describe("status ring", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  const a = (id: string, hoursAgo: number, storyUntil: string | null = null): QaAnswer => ({
    id, body: "q", answer: "a", prompt: null, storyUntil,
    answeredAt: new Date(now - hoursAgo * 3_600_000).toISOString(),
  });
  it("shows answers for 24 hours, oldest first", () => {
    expect(QA_STORY_HOURS).toBe(24);
    const s = activeStories([a("new", 1), a("old", 23), a("gone", 25)], now);
    expect(s.map((x) => x.id)).toEqual(["old", "new"]);
  });
  it("is green until the visitor watched the newest answer", () => {
    const s = activeStories([a("x", 2)], now);
    expect(hasUnseen(s, null)).toBe(true);
    expect(hasUnseen(s, s[0]!.answeredAt)).toBe(false);
  });
});

describe("limits and story format", () => {
  it("allows at most 5 messages per minute per IP", () => {
    expect(QUESTION_RATE).toEqual({ limit: 5, windowSec: 60 });
  });
  it("renders a 1080×1920 story", () => {
    expect([STORY_W, STORY_H]).toEqual([1080, 1920]);
  });
  it("wraps long text within the card width", () => {
    const lines = wrapText((s) => s.length * 10, "een twee drie vier vijf zes", 100);
    expect(lines.every((l) => l.length * 10 <= 100)).toBe(true);
    expect(lines.join(" ")).toBe("een twee drie vier vijf zes");
  });
});
