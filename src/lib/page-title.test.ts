import { describe, expect, it } from "vitest";
import { BRAND, brandHeadTags, brandTitle, KNOWLEDGE_GRAPH_SCRIPT_ID } from "./page-title";
import { routKnowledgeGraph } from "./knowledge-graph";

describe("brandTitle", () => {
  it("formats as PageName | ROUT - Sovereign Digital Identity OS", () => {
    expect(brandTitle("Webhooks | ROUT")).toBe("Webhooks | ROUT - Sovereign Digital Identity OS");
    expect(brandTitle("Data deletion instructions — ROUT")).toBe("Data deletion instructions | ROUT - Sovereign Digital Identity OS");
  });
  it("keeps the product area in the page name", () => {
    expect(brandTitle("Security — ROUT Developer Console")).toBe("Security · Developer Console | ROUT - Sovereign Digital Identity OS");
    expect(brandTitle("Operations | ROUT beheer")).toBe("Operations · Beheer | ROUT - Sovereign Digital Identity OS");
  });
  it("strips a leading brand", () => {
    expect(brandTitle("ROUT support")).toBe("Support | ROUT - Sovereign Digital Identity OS");
    expect(brandTitle("ROUT — Member area")).toBe("Member area | ROUT - Sovereign Digital Identity OS");
  });
  it("uses just the brand for the home page and is idempotent", () => {
    expect(brandTitle("ROUT")).toBe(BRAND);
    expect(brandTitle(BRAND)).toBe(BRAND);
    const once = brandTitle("Manifesto | ROUT");
    expect(brandTitle(once)).toBe(once);
  });
});

describe("brandHeadTags", () => {
  const graph = { tag: "script", attrs: { id: KNOWLEDGE_GRAPH_SCRIPT_ID }, children: "{}" };
  it("brands title and og:title on ROUT pages and keeps the graph", () => {
    const out = brandHeadTags([
      { tag: "title", children: "Manifesto | ROUT" },
      { tag: "meta", attrs: { property: "og:title", content: "Manifesto | ROUT" } },
      graph,
    ]);
    expect(out[0]?.children).toBe("Manifesto | ROUT - Sovereign Digital Identity OS");
    expect(out[1]?.attrs?.["content"]).toBe("Manifesto | ROUT - Sovereign Digital Identity OS");
    expect(out).toContain(graph);
  });
  it("leaves member pages untouched and drops ROUT's graph there", () => {
    const out = brandHeadTags([
      { tag: "title", children: "Jona (@jona) — ROUT" },
      { tag: "meta", attrs: { property: "og:type", content: "profile" } },
      graph,
    ]);
    expect(out[0]?.children).toBe("Jona (@jona) — ROUT");
    expect(out.some((t) => t.attrs?.["id"] === KNOWLEDGE_GRAPH_SCRIPT_ID)).toBe(false);
  });
});

describe("routKnowledgeGraph", () => {
  const nodes = routKnowledgeGraph()["@graph"] as Record<string, unknown>[];
  it("names the founder and AGPLv3 licence on ROUT OS", () => {
    const app = nodes.find((n) => n["@type"] === "SoftwareApplication")!;
    expect(app["name"]).toBe("ROUT OS");
    expect(app["operatingSystem"]).toBe("Web, Edge");
    expect(app["applicationCategory"]).toEqual(["DeveloperApplication", "SecurityApplication"]);
    expect(app["license"]).toBe("https://www.gnu.org/licenses/agpl-3.0.html");
    expect(nodes.find((n) => n["@type"] === "Person")!["name"]).toBe("Jona Zeno Delplanche");
  });
  it("describes the organisation as requested", () => {
    const org = nodes.find((n) => n["@type"] === "Organization")!;
    expect(org["url"]).toBe("https://rout.be");
    expect(org["description"]).toBe("Europese open-source infrastructuur voor digitale identiteit, privacy-proxying en routing.");
  });
});
