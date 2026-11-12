import { describe, expect, it } from "vitest";
import { CHANNEL_CAN_AUTHENTICATE, classifyScan } from "./scan-channel";
import { openPublicCardId, sealPublicCardId } from "./card-public-id";
import { signSecureToken } from "./card-token";

const key = new Uint8Array(32).fill(7);
const uid = "3f2b8c1e-1234-4abc-9def-0123456789ab";

describe("dual-layer scan routing", () => {
  it("printed /v/ QR is classified physical and can never authenticate", async () => {
    const id = await sealPublicCardId(key, uid, "root");
    expect(classifyScan(`/v/${id}`)).toBe("physical-public");
    expect(CHANNEL_CAN_AUTHENTICATE["physical-public"]).toBe(false);
  });

  it("digital /s/ token is classified ephemeral; a card id on /s/ is not", async () => {
    const { token } = await signSecureToken(key, { handle: "anna", space: "root", card: "0123456789abcdef", now: Date.now() });
    expect(classifyScan(`/s/${token}`)).toBe("digital-ephemeral");
    expect(classifyScan(`/v/${token}`)).toBeNull();
    expect(classifyScan(`/s/${await sealPublicCardId(key, uid, "root")}`)).toBeNull();
    expect(classifyScan("/s/my-short-link")).toBeNull();
  });

  it("card id is stable, hides the account id and rejects tampering", async () => {
    const a = await sealPublicCardId(key, uid, "alias");
    expect(await sealPublicCardId(key, uid, "alias")).toBe(a);
    expect(a).not.toContain(uid.slice(0, 8));
    expect(await openPublicCardId(key, a)).toEqual({ accountId: uid, space: "alias" });
    const flipped = a.slice(0, -2) + (a.endsWith("AA") ? "BB" : "AA");
    expect(await openPublicCardId(key, flipped)).toBeNull();
    expect(await openPublicCardId(new Uint8Array(32).fill(8), a)).toBeNull();
  });
});
