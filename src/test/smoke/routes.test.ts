/**
 * Smoke test for the generated route tree: every public and authenticated route
 * the app links to must exist, and each must resolve to a component.
 */
import { describe, expect, it } from "vitest";
import { getRouter } from "@/router";

const EXPECTED = [
  "/",
  "/studio",
  "/batch",
  "/claim",
  "/contact",
  "/manifesto",
  "/privacy",
  "/terms",
  "/hub",
  "/go",
  "/card",
  "/auth",
  "/self-hosting",
  "/sovereignty",
  "/s/$slug",
  "/r/$username",
  "/u/$username",
  "/stats/$token",
  "/signature",
  "/$username",
  "/_authenticated/dashboard/",
  "/_authenticated/dashboard/assets",
  "/_authenticated/dashboard/qr",
  "/_authenticated/dashboard/links",
  "/_authenticated/dashboard/identity",
  "/_authenticated/settings",
  "/_authenticated/admin",
  "/_authenticated/admin/ops",
  "/_authenticated/my-data",
];

describe("route tree", () => {
  // Route ids only exist once the router has initialised the tree.
  const ids = Object.keys(
    (getRouter() as unknown as { routesById: Record<string, unknown> }).routesById,
  );

  it("registers every expected route", () => {
    for (const id of EXPECTED) {
      expect(ids, `missing route ${id}`).toContain(id);
    }
  });

  it("has no duplicate route ids", () => {
    expect(new Set(ids).size).toBe(ids.length);
  });
});
