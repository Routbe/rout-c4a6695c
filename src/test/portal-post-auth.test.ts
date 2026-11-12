import { describe, expect, it } from "vitest";
import { postAuthDestination } from "@/lib/auth/post-auth";

describe("portal-aware login return", () => {
  it("admin login defaults to the portal rather than the member dashboard", () => {
    expect(postAuthDestination("admin", null)).toBe("/admin");
  });
  it("admin login retains an intended admin page", () => {
    expect(postAuthDestination("admin", "/admin/finance")).toBe("/admin/finance");
  });
  it("admin login ignores public destinations", () => {
    expect(postAuthDestination("admin", "/studio")).toBe("/admin");
  });
  it("public login cannot enter administration via a next cookie", () => {
    expect(postAuthDestination("public", "/admin/team")).toBe("/dashboard");
  });
  it("public login keeps member destinations", () => {
    expect(postAuthDestination("public", "/studio")).toBe("/studio");
  });
});