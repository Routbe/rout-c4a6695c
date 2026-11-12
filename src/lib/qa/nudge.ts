/**
 * Pre-send nudge: a quick, local check for unkind language while typing.
 * It only warns the writer; nothing leaves the browser and nothing is blocked.
 */

const WORDS = [
  // nl
  "kanker\\p{L}*", "kut\\p{L}*", "hoer\\p{L}*", "slet\\p{L}*", "mongool", "debiel\\p{L}*", "idioot", "sukkel",
  "trut", "teef", "lelijkerd", "dikzak", "vetzak", "flikker\\p{L}*", "nikker\\p{L}*", "loser\\p{L}*", "mislukkeling",
  "ga dood", "ga je ophangen", "hang jezelf op", "niemand mag je", "iedereen haat je", "zelfmoord",
  // en
  "fuck\\p{L}*", "bitch\\p{L}*", "slut\\p{L}*", "whore\\p{L}*", "retard\\p{L}*", "cunt\\p{L}*", "fag\\p{L}*",
  "kys", "kill yourself", "go die", "nobody likes you", "everyone hates you", "ugly", "fatass",
  // fr
  "connard\\p{L}*", "connasse", "salope\\p{L}*", "pute\\p{L}*", "encul\\p{L}*", "va mourir", "suicide-toi", "moche", "gros porc",
  // de
  "hurensohn\\p{L}*", "schlampe\\p{L}*", "fotze\\p{L}*", "missgeburt\\p{L}*", "behindert\\p{L}*", "bring dich um",
  "stirb", "hässlich\\p{L}*", "fettsack",
];

const PATTERN = new RegExp(`(?<!\\p{L})(?:${WORDS.join("|")})(?!\\p{L})`, "iu");

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

/** Undo common evasions: leetspeak, stretched letters, dots or dashes between letters. */
export function normalizeForNudge(text: string): string {
  return text
    .toLowerCase()
    .replace(/[013457@$!]/g, (c) => LEET[c] ?? c)
    .replace(/(\p{L})(?:[.\-_*]+(?=\p{L}))/gu, "$1")
    .replace(/(\p{L})\1{2,}/gu, "$1")
    .replace(/\s+/g, " ");
}

export function needsNudge(text: string): boolean {
  if (!text.trim()) return false;
  return PATTERN.test(text) || PATTERN.test(normalizeForNudge(text));
}
