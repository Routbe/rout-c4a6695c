import { describe, expect, it } from "vitest";
import { openPublicRef, resolveOwnerRef, sealPublicRef } from "./public-ref.server";

const KEY = "k".repeat(48);
const ID = "123e4567-e89b-12d3-a456-426614174000";

describe("public owner references", () => {
  it("never contains the account id and opens back to it", async () => {
    const ref = (await sealPublicRef(ID, KEY))!;
    expect(ref).not.toContain(ID);
    expect(ref).not.toContain(ID.replace(/-/g, ""));
    await expect(openPublicRef(ref, KEY)).resolves.toBe(ID);
  });

  it("gives a different reference each time, so root and alias pages cannot be linked", async () => {
    expect(await sealPublicRef(ID, KEY)).not.toBe(await sealPublicRef(ID, KEY));
  });

  it("rejects altered references and the wrong key", async () => {
    const ref = (await sealPublicRef(ID, KEY))!;
    const tampered = ref.slice(0, -2) + (ref.endsWith("A") ? "BB" : "AA");
    await expect(openPublicRef(tampered, KEY)).resolves.toBeNull();
    await expect(openPublicRef(ref, "x".repeat(48))).resolves.toBeNull();
  });

  it("issues nothing without a configured key", async () => {
    await expect(sealPublicRef(ID, null)).resolves.toBeNull();
  });

  it("accepts a raw account id only for the signed-in owner", async () => {
    await expect(resolveOwnerRef(ID, ID)).resolves.toBe(ID);
    await expect(resolveOwnerRef(ID, null)).resolves.toBeNull();
    await expect(resolveOwnerRef(ID, "00000000-0000-4000-8000-000000000000")).resolves.toBeNull();
  });
});

describe("sealed photo links", () => {
  it("binds a token to its app: another app cannot open it", async () => {
    const { sealText, openText } = await import("./public-ref.server");
    const t = (await sealText("path", "picture:app-a", KEY))!;
    await expect(openText(t, "picture:app-a", KEY)).resolves.toBe("path");
    await expect(openText(t, "picture:app-b", KEY)).resolves.toBeNull();
  });

  it("finds the account-id path inside a ROUT avatar link only", async () => {
    const { avatarPathOf } = await import("./public-ref.server");
    expect(avatarPathOf(`/api/public/avatar?path=${ID}/a.webp`)).toBe(`${ID}/a.webp`);
    expect(avatarPathOf("https://cdn.example/a.png")).toBeNull();
  });
});
