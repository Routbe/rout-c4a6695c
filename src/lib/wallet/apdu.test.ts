import { describe, expect, it } from "vitest";
import { commands, createKeySession, formatResponseApdu, parseCommandApdu, ROUT_AID, statusWord, SW } from "./apdu";

const fixedSign = async (nonce: Uint8Array) => {
  const k = await crypto.subtle.importKey("raw", new Uint8Array(32).fill(7), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, nonce as BufferSource));
};

describe("ISO 7816-4 APDU codec", () => {
  it("parses short case 1-4 commands", () => {
    expect(parseCommandApdu(Uint8Array.of(0, 0xa4, 4, 0))).toMatchObject({ ins: 0xa4, le: null, data: new Uint8Array(0) });
    expect(parseCommandApdu(Uint8Array.of(0, 0x84, 0, 0, 0))?.le).toBe(256);
    expect(parseCommandApdu(commands.selectRout())?.data).toEqual(ROUT_AID);
    const c4 = parseCommandApdu(Uint8Array.of(0, 0x88, 0, 0, 2, 9, 9, 0x40));
    expect([...c4!.data]).toEqual([9, 9]);
    expect(c4!.le).toBe(64);
  });
  it("parses extended case 2E and 4E commands", () => {
    expect(parseCommandApdu(Uint8Array.of(0, 0x84, 0, 0, 0, 0x01, 0x00))?.le).toBe(256);
    const c = parseCommandApdu(Uint8Array.of(0, 0x88, 0, 0, 0, 0, 2, 1, 2, 0, 0));
    expect([...c!.data]).toEqual([1, 2]);
    expect(c!.le).toBe(65536);
  });
  it("rejects lengths that do not match Lc", () => {
    expect(parseCommandApdu(Uint8Array.of(0, 0xa4, 4))).toBeNull();
    expect(parseCommandApdu(Uint8Array.of(0, 0xa4, 4, 0, 5, 1, 2))).toBeNull();
  });
  it("formats responses as data followed by SW1 SW2", () => {
    expect([...formatResponseApdu(SW.OK, Uint8Array.of(0xaa))]).toEqual([0xaa, 0x90, 0x00]);
    expect(statusWord(formatResponseApdu(SW.FILE_NOT_FOUND))).toBe(0x6a82);
  });
});

describe("Sovereign Key reader session", () => {
  it("answers nothing but 6985 before the ROUT AID is selected", async () => {
    const s = createKeySession({ sign: fixedSign });
    expect(statusWord(await s.handle(commands.internalAuthenticate(new Uint8Array(16).fill(1))))).toBe(SW.CONDITIONS_NOT_SATISFIED);
    expect(statusWord(await s.handle(Uint8Array.of(0, 0xa4, 4, 0, 2, 0xa0, 0x00)))).toBe(SW.FILE_NOT_FOUND);
  });
  it("SELECT returns only 9000, never a static identifier", async () => {
    const r = await createKeySession({ sign: fixedSign }).handle(commands.selectRout());
    expect([...r]).toEqual([0x90, 0x00]);
  });
  it("signs each fresh reader nonce, so two taps never give the same answer", async () => {
    const s = createKeySession({ sign: fixedSign });
    await s.handle(commands.selectRout());
    const a = await s.handle(commands.internalAuthenticate(new Uint8Array(16).fill(1)));
    const b = await s.handle(commands.internalAuthenticate(new Uint8Array(16).fill(2)));
    expect(statusWord(a)).toBe(SW.OK);
    expect(a.length).toBe(34);
    expect([...a]).not.toEqual([...b]);
  });
  it("refuses a replayed nonce within the session", async () => {
    const s = createKeySession({ sign: fixedSign });
    await s.handle(commands.selectRout());
    const nonce = new Uint8Array(16).fill(5);
    await s.handle(commands.internalAuthenticate(nonce));
    expect(statusWord(await s.handle(commands.internalAuthenticate(nonce)))).toBe(SW.CONDITIONS_NOT_SATISFIED);
  });
  it("rejects nonces shorter than 8 or longer than 64 bytes", async () => {
    const s = createKeySession({ sign: fixedSign });
    await s.handle(commands.selectRout());
    expect(statusWord(await s.handle(commands.internalAuthenticate(new Uint8Array(7))))).toBe(SW.WRONG_DATA);
    expect(statusWord(await s.handle(commands.internalAuthenticate(new Uint8Array(65))))).toBe(SW.WRONG_DATA);
  });
  it("returns 6982 when the key refuses to sign, and 6D00 for unknown instructions", async () => {
    const s = createKeySession({ sign: async () => { throw new Error("locked"); } });
    await s.handle(commands.selectRout());
    expect(statusWord(await s.handle(commands.internalAuthenticate(new Uint8Array(16).fill(3))))).toBe(SW.SECURITY_NOT_SATISFIED);
    expect(statusWord(await s.handle(Uint8Array.of(0, 0xb0, 0, 0, 0)))).toBe(SW.INS_NOT_SUPPORTED);
  });
  it("GET CHALLENGE returns exactly Le fresh bytes plus 9000", async () => {
    const s = createKeySession({ sign: fixedSign, random: (n) => new Uint8Array(n).fill(0x42) });
    await s.handle(commands.selectRout());
    const r = await s.handle(commands.getChallenge(16));
    expect(r.length).toBe(18);
    expect(statusWord(r)).toBe(SW.OK);
  });
});
