import { describe, expect, it } from "vitest";
import { mastodonHandle, mastodonUrl, relMeHrefs, splitMastodon, workspaceFromHost } from "./relme-links";

describe("relme-links", () => {
  it("builds the Mastodon profile URL from @user@server", () => {
    expect(mastodonUrl("@Maximilien@mastodon-belgium.be")).toBe("https://mastodon-belgium.be/@Maximilien");
    expect(mastodonHandle("Maximilien", "https://mastodon-belgium.be/")).toBe("@Maximilien@mastodon-belgium.be");
    expect(splitMastodon("https://mastodon-belgium.be/@Maximilien")).toEqual({ user: "Maximilien", server: "mastodon-belgium.be" });
  });
  it("emits rel=me for Mastodon and GitHub only", () => {
    expect(relMeHrefs([
      { platform: "mastodon", username: "@a@mastodon.social" },
      { platform: "github", username: "octocat" },
      { platform: "x", username: "nope" },
    ])).toEqual(["https://mastodon.social/@a", "https://github.com/octocat"]);
  });
  it("maps workspace hosts: <slug>.w.rout.be and <domain>.rout.be", () => {
    expect(workspaceFromHost("maximilien-6yak.w.rout.be")).toEqual({ slug: "maximilien-6yak" });
    expect(workspaceFromHost("maximilien.brussels.rout.be")).toEqual({ domain: "maximilien.brussels" });
    expect(workspaceFromHost("jona.u.rout.be")).toBeNull();
    expect(workspaceFromHost("jona.rout.be")).toBeNull();
  });
});
