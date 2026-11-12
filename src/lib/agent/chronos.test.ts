import { describe, expect, it } from "vitest";
import { agentWebhookPayload, canRevert, isAgentWebhookUrl, revertStrategy } from "./chronos";

describe("revert strategies", () => {
  it("maps each agent action to its inverse", () => {
    expect(revertStrategy("link.create")).toBe("delete_target");
    expect(revertStrategy("profile_draft.update")).toBe("restore_previous");
    expect(revertStrategy("workspace.provision")).toBe("delete_workspace");
  });
  it("unknown actions are not revertible", () => {
    expect(revertStrategy("account.delete")).toBeNull();
    expect(revertStrategy("")).toBeNull();
  });
});

describe("canRevert", () => {
  it("allows one revert of a known action", () => {
    expect(canRevert({ action: "link.create", revertedAt: null })).toBe(true);
  });
  it("blocks a second revert and unknown actions", () => {
    expect(canRevert({ action: "link.create", revertedAt: "2026-11-02T10:00:00Z" })).toBe(false);
    expect(canRevert({ action: "mystery", revertedAt: null })).toBe(false);
  });
});

describe("webhook payloads", () => {
  it("carries only the event, workspace id and timestamp — no PII", () => {
    const payload = agentWebhookPayload("domain.verified", "ws-1", new Date("2026-11-02T10:00:00Z"));
    expect(payload).toEqual({ event: "domain.verified", workspace_id: "ws-1", timestamp: "2026-11-02T10:00:00.000Z" });
    expect(Object.keys(payload)).toHaveLength(3);
  });
});

describe("webhook urls", () => {
  it("accepts https only", () => {
    expect(isAgentWebhookUrl("https://agent.example.com/hook")).toBe(true);
    expect(isAgentWebhookUrl("http://agent.example.com/hook")).toBe(false);
    expect(isAgentWebhookUrl("javascript:alert(1)")).toBe(false);
    expect(isAgentWebhookUrl("")).toBe(false);
  });
});
