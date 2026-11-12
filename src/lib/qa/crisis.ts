/**
 * Local check for words that can signal self-harm or a crisis. It never blocks
 * and nothing leaves the browser: it only offers help numbers, separately from
 * the unkind-language nudge.
 */
import { normalizeForNudge } from "./nudge";

const PHRASES = [
  // nl
  "zelfmoord\\p{L}*", "su[iï]cid\\p{L}*", "zelfdoding", "ik wil dood", "ik wil niet meer leven", "wil er niet meer zijn",
  "mezelf (?:iets )?aan(?:doen)?", "mezelf pijn doen", "mezelf snijden", "ik snij mezelf", "mijn leven beëindigen",
  "ga dood", "hang jezelf op", "spring van een brug",
  // en
  "suicid\\p{L}*", "kill myself", "kill yourself", "kys", "want to die", "end my life", "self[- ]?harm\\p{L}*", "cut myself",
  "go die", "better off dead",
  // fr
  "me suicider", "suicide-toi", "envie de mourir", "me tuer", "en finir avec la vie", "me faire du mal", "va mourir",
  // de
  "selbstmord\\p{L}*", "suizid\\p{L}*", "mich umbringen", "bring dich um", "will sterben", "ritzen", "nicht mehr leben",
];

const PATTERN = new RegExp(`(?<!\\p{L})(?:${PHRASES.join("|")})(?!\\p{L})`, "iu");

export function needsCrisisHelp(text: string): boolean {
  if (!text.trim()) return false;
  return PATTERN.test(text) || PATTERN.test(normalizeForNudge(text));
}

/** Belgian help lines (free, 24/7) shown with every crisis notice. */
export const CRISIS_LINES = [
  { id: "zelfmoordlijn", number: "1813", tel: "1813" },
  { id: "cps", number: "0800 32 123", tel: "080032123" },
  { id: "emergency", number: "112", tel: "112" },
] as const;
