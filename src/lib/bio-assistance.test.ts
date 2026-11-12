import { describe, expect, it } from "vitest";
import { bioCharacterCount, buildBioTemplate, cleanBioText, formatBioText } from "./bio-assistance";

describe("local bio assistance", () => {
  const input = { role: "Ontwerper", focus: "Toegankelijke websites", location: "Gent" };
  it("builds the professional format from supplied facts", () => expect(buildBioTemplate(input, "professional")).toBe("Ontwerper | Toegankelijke websites | Gent"));
  it("builds the minimal format", () => expect(buildBioTemplate(input, "minimal")).toBe("Ontwerper · Toegankelijke websites · Gent"));
  it("builds the creative format", () => expect(buildBioTemplate(input, "creative")).toBe("— Ontwerper\n— Toegankelijke websites\n— Gent"));
  it("does not invent content for blank fields", () => expect(buildBioTemplate({ role: "", focus: "", location: "" }, "professional")).toBe(""));
  it("omits absent fields", () => expect(buildBioTemplate({ ...input, focus: "" }, "professional")).toBe("Ontwerper | Gent"));
  it("cleans spacing without altering facts", () => expect(cleanBioText("  René  in Gent \r\n\r\n\r\n Fotograaf  ")).toBe("René in Gent\n\nFotograaf"));
  it("formats selected text in bold", () => expect(formatBioText("Ik ben ontwerper", "bold", 7, 16).text).toBe("Ik ben **ontwerper**"));
  it("formats italic text", () => expect(formatBioText("Ontwerper", "italic").text).toBe("*Ontwerper*"));
  it("creates a list without empty bullets", () => expect(formatBioText("Design\n\nFoto", "list").text).toBe("- Design\n- Foto"));
  it("escapes user Markdown in wrappers", () => expect(formatBioText("a*b", "bold").text).toBe("**a\\*b**"));
  it("matches the existing UTF-16 counting convention", () => expect(bioCharacterCount("é🙂", 160)).toEqual({ count: 3, remaining: 157, overLimit: false }));
  it("accepts the current profile limit exactly", () => expect(bioCharacterCount("a".repeat(160), 160).overLimit).toBe(false));
  it("detects a profile bio over the existing limit", () => expect(bioCharacterCount("a".repeat(161), 160).overLimit).toBe(true));
});