// @vitest-environment node
import { it, expect } from "vitest";
import { signOmniTicket, verifyOmniTicket } from "./omni-realtime";
const secret = "test-only-omni-secret-at-least-32-characters";
const owner = "11111111-1111-4111-8111-111111111111";
it("authenticates an owner ticket only for its audience", async () => {
  const ticket = await signOmniTicket(owner, "https://events.rout.be", secret, 1000);
  expect((await verifyOmniTicket(ticket, "https://events.rout.be", secret, 2000))?.sub).toBe(owner);
  expect(await verifyOmniTicket(ticket, "https://other.example", secret, 2000)).toBeNull();
});
it("expires the ticket after exactly five minutes", async () => {
  const ticket = await signOmniTicket(owner, "https://events.rout.be", secret, 1000);
  expect(await verifyOmniTicket(ticket, "https://events.rout.be", secret, 300000)).not.toBeNull();
  expect(await verifyOmniTicket(ticket, "https://events.rout.be", secret, 301000)).toBeNull();
});
it("rejects tampered or incorrectly signed tickets", async () => {
  const ticket = await signOmniTicket(owner, "https://events.rout.be", secret);
  expect(await verifyOmniTicket(`X${ticket}`, "https://events.rout.be", secret)).toBeNull();
  expect(await verifyOmniTicket(ticket, "https://events.rout.be", `${secret}different`)).toBeNull();
});