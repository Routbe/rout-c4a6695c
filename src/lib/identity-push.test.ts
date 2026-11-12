import { describe, expect, it } from "vitest";
import { toggleAll, togglePick } from "./identity-push";

const apps = [
  { clientId: "a", choiceId: "primary" },
  { clientId: "b", choiceId: "alias-1" },
  { clientId: "c", choiceId: "relay" },
];

describe("identity push selection", () => {
  it("Select All picks every app except relay apps", () => {
    expect(toggleAll(apps, [])).toEqual(["a", "b"]);
  });

  it("Deselect clears the list when everything is already picked", () => {
    expect(toggleAll(apps, ["a", "b"])).toEqual([]);
  });

  it("a relay app can never be picked by hand", () => {
    expect(togglePick(apps, [], "c")).toEqual([]);
    expect(togglePick(apps, ["a"], "a")).toEqual([]);
  });
});
