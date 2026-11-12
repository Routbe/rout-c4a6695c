import { describe, expect, it } from "vitest";
import { isShownPublicly, mayFetchLive, mayLink } from "@/lib/integration-switches";

describe("integration killswitches", () => {
  it("off hides the provider from public profiles", () => {
    expect(isShownPublicly({ spotify: "off" }, "spotify")).toBe(false);
    expect(isShownPublicly({ spotify: "paused" }, "spotify")).toBe(true);
  });
  it("paused stops live fetches but keeps cards", () => {
    expect(mayFetchLive({ lichess: "paused" }, "lichess")).toBe(false);
    expect(mayFetchLive({}, "lichess")).toBe(true);
  });
  it("only fully-on providers accept new links", () => {
    expect(mayLink({ github: "paused" }, "github")).toBe(false);
    expect(mayLink({ github: "on" }, "github")).toBe(true);
  });
});
