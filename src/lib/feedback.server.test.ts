// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("./neon", () => ({ sql: query }));
import { createFeedback, submitFeedback, updateFeedback } from "./feedback.server";
beforeEach(() => query.mockReset());
describe("feedback persistence boundaries", () => {
  it("refuses creating a form attached to someone else's profile", async () => {
    query.mockResolvedValue([]);
    await expect(createFeedback("owner", null, { title: "Review", profileHandle: "other42", profileSpace: "alias" })).rejects.toThrow("Forbidden");
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("refuses personal bindings inside a workspace", async () => {
    query.mockResolvedValue([{}]);
    await expect(createFeedback("owner", "workspace", { title: "Review", profileHandle: "owner42", profileSpace: "alias" })).rejects.toThrow("Forbidden");
  });
  it("submits anonymous feedback through the narrow public database function", async () => {
    query.mockResolvedValue([]);
    await submitFeedback({ formId: "12345678-1234-4234-8234-123456789abc", rating: 5, comment: "Goed" });
    const [parts, ...params] = query.mock.calls[0];
    expect(parts.join("")).toContain("public.submit_public_feedback");
    expect(params).toEqual(["12345678-1234-4234-8234-123456789abc", 5, "Goed", "", false]);
  });
  it("honeypot submissions never write a response", async () => {
    await submitFeedback({ formId: "12345678-1234-4234-8234-123456789abc", rating: 5, company: "bot" });
    expect(query).not.toHaveBeenCalled();
  });
  it("refuses modifying responses outside active ownership", async () => {
    query.mockResolvedValue([]);
    await expect(updateFeedback("alice", "one", "other", "feature", true)).rejects.toThrow("Forbidden");
    const [parts, ...params] = query.mock.calls[0];
    expect(parts.join("")).toContain("r.allow_featured");
    expect(params).toContain("one");
    expect(params).toContain("alice");
  });
});