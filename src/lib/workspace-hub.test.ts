import { describe, expect, it } from "vitest";
import { readHub, workspaceHubSchema } from "./workspace-hub";

describe("workspace hub", () => {
  it("adds https to bare domains and refuses javascript links", () => {
    const ok = workspaceHubSchema.parse({ links: [{ title: "Site", url: "acme.be" }] });
    expect(ok.links[0]?.url).toBe("https://acme.be");
    expect(workspaceHubSchema.safeParse({ links: [{ title: "x", url: "javascript:alert(1)" }] }).success).toBe(false);
    expect(workspaceHubSchema.safeParse({ links: [{ title: "x", url: "http://acme.be" }] }).success).toBe(false);
  });

  it("allows at most 20 links", () => {
    const links = Array.from({ length: 21 }, (_, i) => ({ title: `L${i}`, url: "https://acme.be" }));
    expect(workspaceHubSchema.safeParse({ links }).success).toBe(false);
  });

  it("stored garbage reads as an empty, unpublished hub", () => {
    expect(readHub({ links: "nope" }).published).toBe(false);
    expect(readHub(null).links).toEqual([]);
  });

  it("audio block defaults to null and stores only an https pointer", () => {
    expect(readHub(null).audio).toBeNull();
    const hub = workspaceHubSchema.parse({ audio: { title: "Introductie", url: "cdn.acme.be/intro.mp3", caption: "Hallo!" } });
    expect(hub.audio?.url).toBe("https://cdn.acme.be/intro.mp3");
    expect(workspaceHubSchema.safeParse({ audio: { title: "x", url: "javascript:alert(1)", caption: "" } }).success).toBe(false);
  });

  it("older stored hubs (with a legacy voiceIntro field) still read cleanly", () => {
    const legacy = readHub({ tagline: "Studio", bio: "Wij maken sites.", links: [], voiceIntro: "oud", published: true });
    expect(legacy.audio).toBeNull();
    expect(legacy.published).toBe(true);
  });
});
