/** Pure rules for the 3-of-5 recovery vault screens. */
export type SlotKind = "paper" | "nfc" | "contact" | "passkey" | "device";

/** ROUT may hold at most 2 passkey-wrapped shards (also enforced in the database). */
export const MAX_SERVER_SHARDS = 2;

/** All 5 shards stored, passkey ones actually sealed, and never 3+ on the server. */
export function slotsReady(slots: { kind: SlotKind; done: boolean; sealed?: unknown }[]): boolean {
  if (slots.length !== 5) return false;
  if (slots.filter((s) => s.kind === "passkey").length > MAX_SERVER_SHARDS) return false;
  return slots.every((s) => s.done && (s.kind !== "passkey" || !!s.sealed));
}

/** How many more distinct valid shards are needed to reach the threshold. */
export function missingShards(validIndexes: number[], threshold: number): number {
  return Math.max(0, threshold - new Set(validIndexes).size);
}

/**
 * A new 24-word phrase may only be generated on a device that holds no Master Key
 * yet and for a member without a vault: generating one next to an existing key
 * would leave data sealed under the old key unreadable.
 */
export function canGeneratePhrase(s: { deviceHasKey: boolean | null; hasVault: boolean }): boolean {
  return s.deviceHasKey === false && !s.hasVault;
}

/** The generated phrase can be confirmed only after it left the screen (copy, file or PDF) and the member ticked the box. */
export function phraseConfirmed(s: { secured: boolean; ticked: boolean }): boolean {
  return s.secured && s.ticked;
}

/** Splits a phrase into numbered words for the screen and the Emergency Kit; only 24-word phrases qualify. */
export function numberedWords(phrase: string): { n: number; word: string }[] | null {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  if (words.length !== 24) return null;
  return words.map((word, i) => ({ n: i + 1, word }));
}

/** File name for downloads, never containing the account name or any word. */
export function kitFileName(kind: "phrase" | "codes", date: Date, ext: "pdf" | "txt"): string {
  return `rout-${kind === "phrase" ? "herstelwoorden" : "herstelcodes"}-${date.toISOString().slice(0, 10)}.${ext}`;
}
