import { brandHtml, stripLightColors } from "./branded.server";
import { test, expect } from "vitest";
test("brand", async () => {
  expect(stripLightColors('<p style="color:#000;font-size:12px">x</p>')).toBe('<p style="font-size:12px">x</p>');
  const h = await brandHtml("<p>Hallo &amp; bedankt</p>", { language: "pt", category: "payment" });
  expect(h).toContain("Hallo &amp; bedankt");
  expect(h).toContain('lang="pt"');
  // The single light ROUT design, never the old dark frame.
  expect(h).toContain("#f6f6f4");
  expect(h).toContain("Sovereign Infrastructure");
  expect(h).toContain("PAID");
});
