/** NGL-style headline prompts for the anonymous Q&A (shared client/server, pure). */
export const QA_PROMPT_KEYS = ["anything", "honest", "confess", "ask", "compliment", "hottake", "never", "rate"] as const;
export type QaPresetKey = (typeof QA_PROMPT_KEYS)[number];
export type QaPromptKey = QaPresetKey | "custom";
export const QA_PROMPT_CUSTOM_MAX = 120;
/** Number of "dice" message starters per locale (pages.qa.dice.1 … n). */
export const QA_DICE_COUNT = 16;

export function isPresetKey(v: unknown): v is QaPresetKey {
  return typeof v === "string" && (QA_PROMPT_KEYS as readonly string[]).includes(v);
}

export function resolvePromptKey(raw: unknown): QaPromptKey {
  if (raw === "custom") return "custom";
  return isPresetKey(raw) ? raw : "anything";
}

export function cleanCustomPrompt(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/\s+/g, " ").trim().slice(0, QA_PROMPT_CUSTOM_MAX);
  return s || null;
}

type T = (key: string) => string;

/** Headline the visitor sees; a custom prompt falls back to the default when empty. */
export function promptHeadline(key: unknown, custom: unknown, t: T): string {
  const k = resolvePromptKey(key);
  if (k === "custom") return cleanCustomPrompt(custom) ?? t("pages.qa.prompt.anything");
  return t(`pages.qa.prompt.${k}`);
}

/** A stored question prompt is either a preset key or the custom text itself. */
export function storedPromptLabel(stored: string | null | undefined, t: T): string | null {
  if (!stored) return null;
  return isPresetKey(stored) ? t(`pages.qa.prompt.${stored}`) : stored;
}

/** Deterministic dice: never repeats the previous starter. */
export function nextDiceIndex(previous: number | null, random: number = Math.random()): number {
  const n = QA_DICE_COUNT;
  let i = Math.floor(random * n) % n;
  if (previous !== null && i === previous) i = (i + 1) % n;
  return i;
}
