import { expect, it } from "vitest";
import { sandboxProfileInput } from "./agent-sandbox";
import { diagnose } from "./diagnostics";

it("names path, rejected value and a removal patch for unknown fields", () => {
  const body = { theme: "midnight", canvas: { x: 1 } };
  const r = sandboxProfileInput.safeParse(body);
  expect(r.success).toBe(false);
  const d = diagnose(r.error!, body);
  expect(d[0]).toMatchObject({ error_code: "unknown_field", path: "canvas", suggested_mutation: { op: "remove", path: "/canvas" } });
});

it("suggests a valid slug for a malformed design token", () => {
  const body = { theme: "Dark Neon!" };
  const r = sandboxProfileInput.safeParse(body);
  const d = diagnose(r.error!, body);
  expect(d[0]).toMatchObject({ error_code: "invalid_design_token", path: "theme", rejected_value: "Dark Neon!", suggested_mutation: { op: "replace", path: "/theme", value: "dark-neon" } });
});
