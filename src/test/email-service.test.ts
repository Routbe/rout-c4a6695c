import { describe, expect, it, vi } from "vitest";

vi.mock("@/emails/send.server", () => ({
  sendMail: vi.fn(async () => {
    throw new Error("brevo down");
  }),
}));

import {
  normalizeLocale,
  resolveTemplateId,
  sendLocalizedEmail,
  TEMPLATE_REGISTRY,
} from "@/lib/email.server";

describe("email service", () => {
  it("normalizes locales safely", () => {
    expect(normalizeLocale("nl")).toBe("nl");
    expect(normalizeLocale("NL")).toBe("nl");
    expect(normalizeLocale("fr-BE")).toBe("fr");
    expect(normalizeLocale("xx")).toBe("en");
    expect(normalizeLocale("")).toBe("en");
    expect(normalizeLocale(undefined)).toBe("en");
    expect(normalizeLocale({})).toBe("en");
  });

  it("maps magic-link to the verified Brevo auth block", () => {
    expect(TEMPLATE_REGISTRY["magic-link"].nl).toBe(93);
    expect(resolveTemplateId("magic-link", "en")).toBe(13);
    expect(resolveTemplateId("magic-link", "de")).toBe(15);
  });

  it("never throws on unknown intent or provider failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      sendLocalizedEmail({ to: "a@b.be", intent: "nope" as never }),
    ).resolves.toBeUndefined();
    await expect(
      sendLocalizedEmail({ to: "a@b.be", intent: "magic-link", locale: "nl", payload: { link: "x" } }),
    ).resolves.toBeUndefined();
    expect(spy.mock.calls.some((c) => c[0] === "[email] dispatch failed")).toBe(true);
    spy.mockRestore();
  });
});
