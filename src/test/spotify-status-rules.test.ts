import { describe, expect, it } from "vitest";
import { reasonFromStatus } from "@/lib/spotify-status-rules";

describe("reasonFromStatus", () => {
  it("403 means the account is not allowed (Development mode)", () => expect(reasonFromStatus(403)).toBe("forbidden"));
  it("204 means no active player", () => expect(reasonFromStatus(204)).toBe("no_content"));
  it("401 means expired access", () => expect(reasonFromStatus(401)).toBe("unauthorized"));
  it("200 is not an error", () => expect(reasonFromStatus(200)).toBeNull());
});
