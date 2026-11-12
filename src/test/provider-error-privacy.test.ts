// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { runQuery } from "@/lib/neon";
import { notifyKchat } from "@/lib/contact.server";

vi.mock("@/lib/webhook-transport.server", () => ({ recordOutboundWebhook: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("does not expose database provider messages containing personal data", async () => {
  vi.stubEnv("LOVABLE_API_KEY", "test-only"); vi.stubEnv("NEON_API_KEY", "test-only");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "23505", message: "jan@example.com PRIVATE_CONTACT_TEXT" }, { status: 400 })));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(runQuery("select 1")).rejects.toThrow("Er is een tijdelijk verbindingsprobleem opgetreden.");
  expect(JSON.stringify(log.mock.calls)).not.toContain("jan@example.com");
  expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE_CONTACT_TEXT");
});

it("does not log or return contact content echoed by a failed provider", async () => {
  vi.stubEnv("KCHAT_WEBHOOK_URL", "https://provider.example/webhook");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("jan@example.com PRIVATE_CONTACT_TEXT", { status: 502 })));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(notifyKchat({ name: "Jan", email: "jan@example.com", subject: "Private", message: "PRIVATE_CONTACT_TEXT", locale: "nl" }))
    .rejects.toThrow("KChat delivery failed");
  expect(JSON.stringify(log.mock.calls)).not.toContain("jan@example.com");
  expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE_CONTACT_TEXT");
});