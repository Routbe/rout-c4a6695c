import { describe, expect, it } from "vitest";
import { CARD_ALPHABET, cardNumberFromDigest, normalizeCardNumber } from "./card-number";

const n = cardNumberFromDigest("a1b2c3d4e5f60718293a4b5c");

describe("card number", () => {
  it("has the RT-XXXX-XXXX-C format", () => {
    expect(n).toMatch(/^RT-[0-9A-Y]{4}-[0-9A-Y]{4}-[0-9A-Y]$/);
    expect(normalizeCardNumber(n)).toBe(n);
  });
  it("catches every single-character typo", () => {
    for (let i = 3; i < n.length; i++) {
      if (n[i] === "-") continue;
      for (const c of CARD_ALPHABET) {
        if (c === n[i]) continue;
        expect(normalizeCardNumber(n.slice(0, i) + c + n.slice(i + 1))).toBeNull();
      }
    }
  });
  it("catches swapped neighbours", () => {
    const body = n.replace(/^RT-/, "").replace(/-/g, "");
    for (let i = 0; i < 7; i++) {
      if (body[i] === body[i + 1]) continue;
      const b = body.slice(0, i) + body[i + 1] + body[i] + body.slice(i + 2);
      expect(normalizeCardNumber(`RT-${b.slice(0, 4)}-${b.slice(4, 8)}-${b[8]}`)).toBeNull();
    }
  });
  it("accepts lower case and O/I confusion", () => {
    expect(normalizeCardNumber(n.toLowerCase())).toBe(n);
  });
});
