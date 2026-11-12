/**
 * ISO/IEC 7816-4 APDU codec + Sovereign Key session (pure, browser- and Worker-safe).
 *
 * Browsers cannot emulate a card: Web NFC (NDEFReader) only reads/writes NDEF tags
 * and never receives reader APDUs. This module is the protocol core for a native
 * HCE service (Android HostApduService) or a reader, and is exercised by tests.
 *
 * Session rules:
 *  - SELECT by DF name (A4 04) must name the ROUT AID before anything else answers.
 *  - SELECT never returns an identifier; the card answers with status words only.
 *  - INTERNAL AUTHENTICATE (88) signs the reader's fresh nonce; a nonce is accepted
 *    once per session, so a recorded answer can never be replayed.
 *  - GET CHALLENGE (84) returns fresh random bytes for mutual authentication.
 */

export const SW = {
  OK: 0x9000,
  WRONG_LENGTH: 0x6700,
  SECURITY_NOT_SATISFIED: 0x6982,
  CONDITIONS_NOT_SATISFIED: 0x6985,
  WRONG_DATA: 0x6a80,
  FILE_NOT_FOUND: 0x6a82,
  WRONG_P1P2: 0x6b00,
  INS_NOT_SUPPORTED: 0x6d00,
  CLA_NOT_SUPPORTED: 0x6e00,
} as const;

export const INS = { SELECT: 0xa4, GET_CHALLENGE: 0x84, INTERNAL_AUTHENTICATE: 0x88 } as const;

/** Proprietary AID: 'F' category + "ROUT" + version 01 (ISO 7816-5 unregistered range). */
export const ROUT_AID = Uint8Array.of(0xf0, 0x52, 0x4f, 0x55, 0x54, 0x01);

export type CommandApdu = { cla: number; ins: number; p1: number; p2: number; data: Uint8Array; le: number | null };

/** Parses short and extended command APDUs (cases 1, 2, 3, 4). Null = malformed length. */
export function parseCommandApdu(b: Uint8Array): CommandApdu | null {
  if (b.length < 4) return null;
  const head = { cla: b[0]!, ins: b[1]!, p1: b[2]!, p2: b[3]! };
  const empty = new Uint8Array(0);
  if (b.length === 4) return { ...head, data: empty, le: null };
  const rest = b.subarray(4);
  if (rest[0] !== 0 || rest.length < 3) {
    // Short form.
    if (rest.length === 1) return { ...head, data: empty, le: rest[0] === 0 ? 256 : rest[0]! };
    const lc = rest[0]!;
    if (lc === 0) return null;
    if (rest.length === 1 + lc) return { ...head, data: rest.slice(1, 1 + lc), le: null };
    if (rest.length === 2 + lc) { const le = rest[1 + lc]!; return { ...head, data: rest.slice(1, 1 + lc), le: le === 0 ? 256 : le }; }
    return null;
  }
  // Extended form: 00 followed by two length bytes.
  const n = (rest[1]! << 8) | rest[2]!;
  if (rest.length === 3) return { ...head, data: empty, le: n === 0 ? 65536 : n };
  if (n === 0) return null;
  if (rest.length === 3 + n) return { ...head, data: rest.slice(3, 3 + n), le: null };
  if (rest.length === 5 + n) { const le = (rest[3 + n]! << 8) | rest[4 + n]!; return { ...head, data: rest.slice(3, 3 + n), le: le === 0 ? 65536 : le }; }
  return null;
}

/** Response APDU: data || SW1 SW2. */
export function formatResponseApdu(sw: number, data: Uint8Array = new Uint8Array(0)): Uint8Array {
  const out = new Uint8Array(data.length + 2);
  out.set(data, 0);
  out[data.length] = (sw >> 8) & 0xff;
  out[data.length + 1] = sw & 0xff;
  return out;
}

export function statusWord(response: Uint8Array): number {
  return response.length < 2 ? -1 : (response[response.length - 2]! << 8) | response[response.length - 1]!;
}

const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export type KeySessionDeps = {
  /** Signs the reader nonce with the Sovereign Key (hardware enclave / WebAuthn in the host app). */
  sign: (nonce: Uint8Array) => Promise<Uint8Array>;
  random?: (n: number) => Uint8Array;
};

export const NONCE_MIN = 8;
export const NONCE_MAX = 64;

/** One reader session (field on → field off). Feed every command APDU to `handle`. */
export function createKeySession(deps: KeySessionDeps) {
  const random = deps.random ?? ((n: number) => crypto.getRandomValues(new Uint8Array(n)));
  let selected = false;
  const seen = new Set<string>();

  async function handle(raw: Uint8Array): Promise<Uint8Array> {
    const c = parseCommandApdu(raw);
    if (!c) return formatResponseApdu(SW.WRONG_LENGTH);
    if ((c.cla & 0x70) !== 0) return formatResponseApdu(SW.CLA_NOT_SUPPORTED);

    if (c.ins === INS.SELECT) {
      if (c.p1 !== 0x04 || (c.p2 !== 0x00 && c.p2 !== 0x0c)) return formatResponseApdu(SW.WRONG_P1P2);
      selected = equal(c.data, ROUT_AID);
      return formatResponseApdu(selected ? SW.OK : SW.FILE_NOT_FOUND);
    }
    if (!selected) return formatResponseApdu(SW.CONDITIONS_NOT_SATISFIED);

    if (c.ins === INS.GET_CHALLENGE) {
      if (c.p1 !== 0 || c.p2 !== 0) return formatResponseApdu(SW.WRONG_P1P2);
      if (c.le === null || c.le < NONCE_MIN || c.le > NONCE_MAX || c.data.length) return formatResponseApdu(SW.WRONG_LENGTH);
      return formatResponseApdu(SW.OK, random(c.le));
    }
    if (c.ins === INS.INTERNAL_AUTHENTICATE) {
      if (c.p1 !== 0 || c.p2 !== 0) return formatResponseApdu(SW.WRONG_P1P2);
      if (c.data.length < NONCE_MIN || c.data.length > NONCE_MAX) return formatResponseApdu(SW.WRONG_DATA);
      const id = hex(c.data);
      if (seen.has(id)) return formatResponseApdu(SW.CONDITIONS_NOT_SATISFIED);
      seen.add(id);
      try {
        return formatResponseApdu(SW.OK, await deps.sign(c.data));
      } catch {
        return formatResponseApdu(SW.SECURITY_NOT_SATISFIED);
      }
    }
    return formatResponseApdu(SW.INS_NOT_SUPPORTED);
  }

  return { handle, get selected() { return selected; } };
}

/** Builds command APDUs (reader side / tests). */
export const commands = {
  selectRout: () => Uint8Array.of(0x00, INS.SELECT, 0x04, 0x00, ROUT_AID.length, ...ROUT_AID),
  getChallenge: (le = 16) => Uint8Array.of(0x00, INS.GET_CHALLENGE, 0x00, 0x00, le),
  internalAuthenticate: (nonce: Uint8Array) => Uint8Array.of(0x00, INS.INTERNAL_AUTHENTICATE, 0x00, 0x00, nonce.length, ...nonce, 0x00),
};
