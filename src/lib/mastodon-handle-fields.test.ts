import { describe, expect, it } from "vitest";
import { joinMastodonHandle, mastodonProfileSchema, splitMastodonHandle } from "./fediverse-profile";

describe("Mastodon username + server fields", () => {
  it("splits a saved profile URL into username and server", () => {
    expect(splitMastodonHandle("https://mastodon-belgium.be/@Maximilien")).toEqual({ user: "Maximilien", server: "mastodon-belgium.be" });
  });
  it("splits an @user@server handle", () => {
    expect(splitMastodonHandle("@Maximilien@mastodon-belgium.be")).toEqual({ user: "Maximilien", server: "mastodon-belgium.be" });
  });
  it("joins the fields into the profile URL that gets saved", () => {
    expect(mastodonProfileSchema.parse(joinMastodonHandle("@Maximilien", "https://mastodon-belgium.be/"))).toBe("https://mastodon-belgium.be/@Maximilien");
  });
});
