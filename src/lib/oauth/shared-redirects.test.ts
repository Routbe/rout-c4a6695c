import { describe, expect, it } from "vitest";
import { findSharedRedirects } from "./shared-redirects";

describe("findSharedRedirects", () => {
  it("flags apps that register the same return address", () => {
    const r = findSharedRedirects([
      { clientId: "a", name: "MAXIMILIEN", redirectUris: ["https://maximilien.brussels/auth/callback/rout"] },
      { clientId: "b", name: "Maximilien", redirectUris: ["https://maximilien.brussels/auth/callback/rout"] },
      { clientId: "c", name: "Other", redirectUris: ["https://other.example/cb"] },
    ]);
    expect(r).toEqual({ a: ["Maximilien"], b: ["MAXIMILIEN"] });
  });
});
