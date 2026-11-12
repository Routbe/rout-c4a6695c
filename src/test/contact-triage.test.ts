import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permission: vi.fn() }));
vi.mock("@/lib/admin-access.server", () => ({ assertAdminPermission: mocks.permission }));
import { analyzeContactForSupport } from "@/lib/contact-triage.server";
import { contactTriageInput, prepareContactMessage, triageContact } from "@/lib/contact-triage";

describe("support contact triage (local)", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("refuses anonymous callers with 401", async () => {
    await expect(analyzeContactForSupport("", { message: "Help met mijn account" })).rejects.toMatchObject({ statusCode: 401 });
  });
  it("refuses staff without the contact permission with 403", async () => {
    mocks.permission.mockRejectedValue(Object.assign(new Error("forbidden"), { statusCode: 403 }));
    await expect(analyzeContactForSupport("member", { message: "Help met mijn account" })).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.permission).toHaveBeenCalledWith("member", "triage_contact");
  });
  it("returns a local classification for authorized staff", async () => {
    const r = await analyzeContactForSupport("support", { message: "Ik kan niet inloggen met mijn account." });
    expect(r).toMatchObject({ ok: true, result: { category: "Support", priority: "Hoog" } });
  });
  it("classifies bugs", () => expect(triageContact("De pagina geeft een foutmelding en laadt niet op mijn telefoon.").category).toBe("Bug"));
  it("handles typographic apostrophes in urgent login reports", () => expect(triageContact("I can’t log in to my account.")).toMatchObject({ category: "Support", priority: "Hoog" }));
  it("keeps ordinary longer messages at normal priority", () => expect(triageContact("We zouden graag informatie ontvangen over jullie initiatief en vertellen met plezier meer over ons eigen project.")).toMatchObject({ category: "Algemeen", priority: "Normaal" }));
  it("classifies sales questions", () => expect(triageContact("Wat is de prijs voor een zakelijk abonnement voor ons team?").category).toBe("Sales"));
  it("marks security incidents as urgent", () => {
    const r = triageContact("Mijn account is gehackt en iemand doet zich voor als mij.");
    expect(r.category).toBe("Veiligheid");
    expect(r.priority).toBe("Urgent");
  });
  it("gives short general messages low priority", () => expect(triageContact("Bedankt voor de leuke app!")).toMatchObject({ category: "Algemeen", priority: "Laag" }));
  it("keeps addresses out of the summary", () => expect(triageContact("Mail me op jane@example.com over mijn betaling.").summary).not.toContain("jane@example.com"));
  it("bounds contact input", () => { expect(contactTriageInput.safeParse({ message: "a".repeat(10001) }).success).toBe(false); });
  it("removes contact addresses and credentials", () => { expect(prepareContactMessage("mail jane@example.com password: private Bearer abc")).toBe("mail [e-mailadres] password: [verwijderd] Bearer [verwijderd]"); });
});
