import { describe, expect, it } from "vitest";
import { providerAvailable } from "./provider-availability";
const ready = { ready: true, code: null } as const;
describe("restored public sign-in options", () => {
  it.each(["google", "github", "gitlab", "mastodon", "bluesky", "oidc", "infomaniak"])("allows configured %s on a ready account service", id => {
    expect(providerAvailable(id, [id], ready)).toBe(true);
    expect(providerAvailable(id, [], ready)).toBe(false);
  });
  it("never enables Google while the account signing secret is missing", () => {
    expect(providerAvailable("google", ["google"], { ready: false, code: "missing_secret" })).toBe(false);
  });
});