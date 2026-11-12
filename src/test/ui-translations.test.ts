import { describe, expect, it } from "vitest";
import en from "@/locales/pages/ui.en.json";
import nl from "@/locales/pages/ui.nl.json";
import fr from "@/locales/pages/ui.fr.json";
import de from "@/locales/pages/ui.de.json";

const bundles = { en, nl, fr, de } as Record<string, Record<string, string>>;

describe("interface translations", () => {
  it("every message exists in all four languages", () => {
    const keys = Object.keys(en);
    for (const [locale, bundle] of Object.entries(bundles)) {
      expect(Object.keys(bundle).sort(), locale).toEqual([...keys].sort());
      for (const k of keys) expect(bundle[k]?.trim(), `${locale}:${k}`).toBeTruthy();
    }
  });

  it("the About invite badge is translated per language", () => {
    expect(nl["about.invitedBy"]).toBe("Uitgenodigd door @{{handle}}");
    expect(en["about.invitedBy"]).toBe("Invited by @{{handle}}");
  });
});
