import { describe, expect, it } from "vitest";
import { DEFAULT_INTERFACE_THEME, isInternalInterface, parseInterfaceTheme } from "./internal-interface-theme";

describe("internal interface policy", () => {
  it("defaults to Mechanical", () => expect(DEFAULT_INTERFACE_THEME).toBe("mechanical"));
  it("keeps Glass, maps legacy keys and rejects unknown stored choices", () => {
    expect(parseInterfaceTheme("glass")).toBe("glass");
    expect(parseInterfaceTheme("creator")).toBe("glass");
    expect(parseInterfaceTheme("sovereign")).toBe("mechanical");
    expect(parseInterfaceTheme(null)).toBe("mechanical");
    expect(parseInterfaceTheme("neon")).toBe("mechanical");
  });
  it("never activates for the public homepage or member profiles", () => {
    for (const path of ["/", "/u/daniel", "/daniel", "/auth/sign-in", "/features/analytics"]) {
      expect(isInternalInterface(path, ["__root__", "/"])).toBe(false);
    }
  });
  it("activates across authenticated tools and public QR studio", () => {
    for (const path of ["/dashboard", "/studio/account", "/analytics", "/console"]) {
      expect(isInternalInterface(path, ["__root__", "/_authenticated"])).toBe(true);
    }
    expect(isInternalInterface("/studio", ["/studio"])).toBe(true);
    expect(isInternalInterface("/qr", ["/qr"])).toBe(true);
  });
});