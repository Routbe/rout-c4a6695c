/**
 * Machine-readable zone for the back of the ROUT Card in the ICAO 9303 TD1
 * layout (3 lines x 30 characters, the ID-card size) with 7-3-1 check digits.
 * Hash-filled birth fields are a privacy extension, NOT ICAO certification.
 * Privacy by design: the birth-date field carries a one-way holder hash and the
 * sex field stays empty; no name, birth date or account id is ever encoded.
 * Issuer code "RTB" is ROUT's own, so the card never poses as a state document.
 */
const LINE = 30;
export const MRZ_ISSUER = "RTB";

export function mrzChars(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "<");
}

function pad(s: string, n: number): string {
  return (s + "<".repeat(n)).slice(0, n);
}

export function mrzCheckDigit(field: string): number {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < field.length; i++) {
    const c = field.charAt(i);
    const v = c === "<" ? 0 : c >= "0" && c <= "9" ? c.charCodeAt(0) - 48 : c >= "A" && c <= "Z" ? c.charCodeAt(0) - 55 : -1;
    if (v < 0) throw new Error("invalid MRZ character");
    sum += v * (w[i % 3] ?? 1);
  }
  return sum % 10;
}

function yymmdd(d: Date): string {
  if (!Number.isFinite(d.getTime())) throw new Error("invalid expiry date");
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

export type MrzInput = {
  sovereignId: string;
  handle: string;
  space: "root" | "alias";
  /** One-way public hash of the holder (6+ alphanumerics), never the account id. */
  holderHash?: string;
  expiry?: Date | null;
  surname?: string;
  givenNames?: string;
  nodeHash?: string;
};

export function generateMRZ_TD1(p: MrzInput): [string, string, string] {
  // TD1 has a 9-character document field followed by its check digit, then
  // 15 optional characters. A 15-character document field would not be TD1.
  const doc = pad(mrzChars(p.sovereignId.replace(/^RT-/, "")).replace(/</g, ""), 9);
  const l1 = pad(`I<${MRZ_ISSUER}${doc}${mrzCheckDigit(doc)}${p.space === "alias" ? "ALIAS" : "ROOT"}`, LINE);
  const holder = pad(mrzChars(p.holderHash ?? "").replace(/</g, ""), 6);
  const exp = p.expiry ? yymmdd(p.expiry) : "<<<<<<";
  const optional = pad(mrzChars(p.nodeHash ?? "ROUT<SOVEREIGN"), 11);
  const body = `${holder}${mrzCheckDigit(holder)}<${exp}${mrzCheckDigit(exp)}${MRZ_ISSUER}${optional}`;
  const composite = l1.slice(5, 30) + body.slice(0, 7) + body.slice(8, 15) + body.slice(18, 29);
  const l2 = body + mrzCheckDigit(composite);
  const l3 = pad(`${mrzChars(p.surname ?? "ROUT")}<<${mrzChars(p.givenNames ?? p.handle)}`, LINE);
  const lines: [string, string, string] = [l1, l2, l3];
  if (!isStrictTd1(lines) || !verifyMrz(lines).ok) throw new Error("Invalid generated ROUT TD1 payload");
  return lines;
}

export const cardMrz = generateMRZ_TD1;

export function isStrictTd1(input: readonly string[]): boolean {
  return input.length === 3 && input.every((line) => /^[A-Z0-9<]{30}$/.test(line));
}

export type MrzCheck =
  | { ok: true; documentNumber: string; issuer: string; expiry: string | null }
  | { ok: false; reason: "format" | "document" | "holder" | "expiry" | "composite" };

/** Offline integrity check only: not proof of identity or access authorization. */
export function verifyMrz(input: string | string[]): MrzCheck {
  const lines = Array.isArray(input) ? input : input.split(/\r?\n/);
  const [l1, l2, l3] = lines;
  if (!l1 || !l2 || !l3 || lines.length !== 3 || lines.some((l) => !/^[A-Z0-9<]{30}$/.test(l)) || !l1.startsWith("I<") || l1.slice(2, 5) !== MRZ_ISSUER) return { ok: false, reason: "format" };
  const digit = (s: string) => (s >= "0" && s <= "9" ? Number(s) : -1);
  if (mrzCheckDigit(l1.slice(5, 14)) !== digit(l1.charAt(14))) return { ok: false, reason: "document" };
  if (mrzCheckDigit(l2.slice(0, 6)) !== digit(l2.charAt(6))) return { ok: false, reason: "holder" };
  if (mrzCheckDigit(l2.slice(8, 14)) !== digit(l2.charAt(14))) return { ok: false, reason: "expiry" };
  const composite = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);
  if (mrzCheckDigit(composite) !== digit(l2.charAt(29))) return { ok: false, reason: "composite" };
  const exp = l2.slice(8, 14);
  return { ok: true, documentNumber: l1.slice(5, 14).replace(/<+$/, ""), issuer: l1.slice(2, 5), expiry: exp.includes("<") ? null : exp };
}
