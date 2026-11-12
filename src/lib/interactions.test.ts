import { describe, expect, it } from "vitest";
import {
  mapEmbedUrl,
  mapExternalUrl,
  parseCustomButtonConfig,
  parseFaqConfig,
  parsePollConfig,
  parseProductConfig,
} from "./interactions";

describe("parsePollConfig", () => {
  it("lege invoer → twee lege opties", () => {
    expect(parsePollConfig("").options).toEqual(["", ""]);
  });

  it("geldige JSON", () => {
    const c = parsePollConfig(JSON.stringify({ question: "Welke?", options: ["A", "B", "C"] }));
    expect(c.question).toBe("Welke?");
    expect(c.options).toHaveLength(3);
  });

  it("maximaal 6 opties", () => {
    const c = parsePollConfig(
      JSON.stringify({ options: ["1", "2", "3", "4", "5", "6", "7", "8"] }),
    );
    expect(c.options).toHaveLength(6);
  });

  it("kapotte JSON → default", () => {
    expect(parsePollConfig("{broken").options).toEqual(["", ""]);
  });

  it("minder dan 2 opties → default", () => {
    expect(parsePollConfig(JSON.stringify({ options: ["alleen"] })).options).toEqual(["", ""]);
  });
});

describe("parseFaqConfig", () => {
  it("filtert ongeldige items", () => {
    const c = parseFaqConfig(
      JSON.stringify({ items: [{ q: "Vraag", a: "Antwoord" }, { q: 1 }, null, "x"] }),
    );
    expect(c.items).toEqual([{ q: "Vraag", a: "Antwoord" }]);
  });

  it("valt terug op default titel", () => {
    expect(parseFaqConfig("").title).toBe("Veelgestelde vragen");
  });
});

describe("parseCustomButtonConfig / parseProductConfig", () => {
  it("newTab default true", () => {
    expect(parseCustomButtonConfig(JSON.stringify({ url: "https://x.dev" })).newTab).toBe(true);
  });

  it("product defaults", () => {
    const p = parseProductConfig(undefined);
    expect(p.title).toBe("");
    expect(p.price).toBe("");
  });
});

describe("map urls", () => {
  it("embed URL bevat ge-encodeerd adres", () => {
    expect(mapEmbedUrl("Herengracht 1, Amsterdam")).toBe(
      "https://www.google.com/maps?q=Herengracht%201%2C%20Amsterdam&output=embed",
    );
  });

  it("externe OSM-link", () => {
    expect(mapExternalUrl("Utrecht")).toContain("openstreetmap.org/search?query=Utrecht");
  });
});
