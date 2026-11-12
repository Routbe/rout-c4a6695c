import { describe, expect, it } from "vitest";
import { plural } from "./plural";

describe("plural", () => {
  it("uses singular for exactly one", () => {
    expect(plural(1, "melding", "meldingen")).toBe("1 melding");
    expect(plural(1, "nieuw bericht", "nieuwe berichten")).toBe("1 nieuw bericht");
  });
  it("uses plural for zero and many", () => {
    expect(plural(0, "melding", "meldingen")).toBe("0 meldingen");
    expect(plural(3, "melding", "meldingen")).toBe("3 meldingen");
  });
  it("renders unknown counts as a dash", () => {
    expect(plural(null, "melding", "meldingen")).toBe("— meldingen");
  });
});
