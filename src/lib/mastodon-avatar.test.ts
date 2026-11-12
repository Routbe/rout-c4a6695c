import { expect, it } from "vitest";
import { mastodonAvatarSrc } from "./mastodon-avatar";
it("routes configured Mastodon handles through the first-party cached handler", () => {
  expect(mastodonAvatarSrc("@alice@mastodon.social")).toBe("/api/public/integrations/mastodon/avatar?handle=%40alice%40mastodon.social");
  expect(mastodonAvatarSrc("https://mastodon.social/@alice")).toBe("/api/public/integrations/mastodon/avatar?handle=%40alice%40mastodon.social");
});
it("never returns a remote avatar or accepts credential-bearing URLs", () => {
  expect(mastodonAvatarSrc("https://user:password@mastodon.social/@alice")).toBeNull();
  expect(mastodonAvatarSrc("https://mastodon.social/files/image.png")).toBeNull();
});