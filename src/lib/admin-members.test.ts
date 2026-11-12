import { describe, expect, it } from "vitest";
import { memberStatus } from "./admin-members-rules";

describe("memberStatus", () => {
  it("ban beats everything", () => {
    expect(memberStatus({ is_banned: true, status: "frozen", is_shadowbanned: true })).toBe("banned");
  });
  it("freeze beats shadowban", () => {
    expect(memberStatus({ status: "frozen", is_shadowbanned: true })).toBe("frozen");
  });
  it("shadowban beats active", () => {
    expect(memberStatus({ status: "active", is_shadowbanned: true })).toBe("shadowbanned");
  });
  it("defaults to active", () => {
    expect(memberStatus({})).toBe("active");
  });
});
