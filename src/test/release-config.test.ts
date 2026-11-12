// @vitest-environment node
import { expect, it } from "vitest";
import { validateReleaseEnvironment } from "../../scripts/release-config";

const configured = () => ({
  DATABASE_URL: "postgresql://test.example/app", PUBLIC_ORIGIN: "https://rout.be",
});
it("passes with only DATABASE_URL and PUBLIC_ORIGIN, without platform keys", () => {
  expect(validateReleaseEnvironment(configured())).toEqual([]);
});
it("requires DATABASE_URL", () => {
  expect(validateReleaseEnvironment({ PUBLIC_ORIGIN: "https://rout.be" }))
    .toContainEqual({ key: "DATABASE_URL", reason: "Missing required setting" });
});
it("requires PUBLIC_ORIGIN", () => {
  expect(validateReleaseEnvironment({ DATABASE_URL: configured().DATABASE_URL }))
    .toContainEqual({ key: "PUBLIC_ORIGIN", reason: "Missing required setting" });
});
it("accepts HTTPS URLs including trailing slash, paths and queries", () => {
  for (const PUBLIC_ORIGIN of ["https://rout.be/", "https://rout.dlp.li/api/auth?next=studio#login"]) {
    expect(validateReleaseEnvironment({ ...configured(), PUBLIC_ORIGIN })).toEqual([]);
  }
});
it("does not require unrelated release settings", () => {
  expect(validateReleaseEnvironment({ ...configured(), VITE_APP_MODE: "public", APP_MODE: "admin" }))
    .toEqual([]);
});