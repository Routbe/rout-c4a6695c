import { describe, expect, it } from "vitest";
import { parseOmniInput } from "./omni-parser";

describe("Omni-Bar parser", () => {
  it("sends a pasted http(s) URL straight to the Studio QR generator", () => {
    const r = parseOmniInput("https://example.com/menu?t=1");
    expect(r.kind).toBe("url");
    expect(r.kind === "url" && r.destination).toBe(
      `/studio?mode=qr&url=${encodeURIComponent("https://example.com/menu?t=1")}`,
    );
  });

  it("treats a bare domain as an https URL", () => {
    const r = parseOmniInput("rout.be/about");
    expect(r.kind === "url" && r.url).toBe("https://rout.be/about");
  });

  it("never routes non-web schemes to the generator", () => {
    expect(parseOmniInput("javascript:alert(1)").kind).toBe("unknown");
    expect(parseOmniInput("ftp://example.com").kind).toBe("unknown");
  });

  it("opens a profile for an @handle", () => {
    expect(parseOmniInput("@Jane.Doe")).toEqual({ kind: "handle", handle: "jane.doe", destination: "/@jane.doe" });
  });

  it("runs commands with or without a prefix", () => {
    expect(parseOmniInput("/dashboard")).toMatchObject({ kind: "command", destination: "/dashboard" });
    expect(parseOmniInput("> identity")).toMatchObject({ kind: "command", destination: "/dashboard/identity" });
    expect(parseOmniInput("studio")).toMatchObject({ kind: "command", destination: "/studio" });
  });

  it("leaves plain text and email addresses unrouted", () => {
    expect(parseOmniInput("hallo wereld").kind).toBe("unknown");
    expect(parseOmniInput("jane@example.com").kind).toBe("unknown");
    expect(parseOmniInput("   ").kind).toBe("empty");
  });
});
