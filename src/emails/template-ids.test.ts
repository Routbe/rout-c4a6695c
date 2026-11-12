import { afterEach, describe, expect, it } from "vitest";
import {
  ADMIN_ALERT_TEMPLATE_ID,
  EMAIL_CATEGORY_FALLBACK,
  EMAIL_LANGUAGES,
  EMAIL_TEMPLATE_IDS,
  GLOBAL_FALLBACK_TEMPLATE_ID,
  adminAlertTemplateId,
  asEmailLanguage,
  brevoTemplateId,
  globalFallbackTemplateId,
  reserveTemplateId,
  type EmailCategory,
} from "./template-ids";
import { TEMPLATE_CATALOG } from "./template-catalog";

const CATEGORIES = Object.keys(EMAIL_TEMPLATE_IDS) as EmailCategory[];
const AUTH_CATEGORIES: EmailCategory[] = [
  "login",
  "recovery",
  "email_change",
  "invite",
  "reauthentication",
  "confirmation",
  "deletion",
];
const touched: string[] = [];

function setEnv(name: string, value: string): void {
  touched.push(name);
  process.env[name] = value;
}

afterEach(() => {
  for (const name of touched.splice(0)) delete process.env[name];
});

describe("language normalisation", () => {
  it("normalises locales, regions and junk to a supported language", () => {
    expect(asEmailLanguage("EN")).toBe("en");
    expect(asEmailLanguage("fr-BE")).toBe("fr");
    expect(asEmailLanguage("nl_NL")).toBe("nl");
    expect(asEmailLanguage("zh-Hans")).toBe("zh");
    expect(asEmailLanguage("klingon")).toBe("en");
    expect(asEmailLanguage(undefined)).toBe("en");
    expect(asEmailLanguage(null)).toBe("en");
    expect(asEmailLanguage(42)).toBe("en");
  });
});

describe("auth block matches the live Brevo templates", () => {
  const expected: Record<string, number> = {
    nl: 93,
    en: 13,
    fr: 14,
    de: 15,
    es: 16,
    it: 17,
    pt: 18,
    pl: 19,
    zh: 20,
  };

  for (const category of AUTH_CATEGORIES) {
    for (const language of EMAIL_LANGUAGES) {
      it(`${category}/${language} → #${expected[language]}`, () => {
        expect(brevoTemplateId(category, language)).toBe(expected[language]);
      });
    }
  }

  it("never routes an auth mail to the admin/system templates", () => {
    for (const category of AUTH_CATEGORIES) {
      for (const language of EMAIL_LANGUAGES) {
        expect([1, 11, 12]).not.toContain(brevoTemplateId(category, language));
      }
    }
  });
});

describe("brevoTemplateId", () => {
  it("uses the verified table for every category × language", () => {
    for (const category of CATEGORIES) {
      const table = EMAIL_TEMPLATE_IDS[category];
      for (const language of EMAIL_LANGUAGES) {
        const id = brevoTemplateId(category, language);
        if (table[language]) expect(id).toBe(table[language]);
        else expect(id).toBe(table.en ?? table.nl ?? EMAIL_CATEGORY_FALLBACK[category]);
      }
    }
  });

  it("routes unknown languages to English", () => {
    expect(brevoTemplateId("login", "xx")).toBe(13);
  });

  it("follows the master fallback matrix", () => {
    expect(brevoTemplateId("payment", "pt")).toBe(68);
    expect(brevoTemplateId("refund", "nl")).toBe(82);
    expect(brevoTemplateId("cancellation", "de")).toBe(75);
    expect(brevoTemplateId("renewal", "pt")).toBe(58);
    expect(reserveTemplateId("renewal")).toBe(61);
    expect(brevoTemplateId("form", "es")).toBe(26);
    expect(brevoTemplateId("payment_confirmation", "fr")).toBe(34);
    expect(brevoTemplateId("payment_issue", "zh")).toBe(50);
    expect(brevoTemplateId("subdomain_claim", "fr")).toBe(2);
  });

  it("resolves to 0 for categories without a Brevo template (inline HTML)", () => {
    expect(brevoTemplateId("welcome", "nl")).toBe(0);
    expect(reserveTemplateId("welcome")).toBe(0);
  });
});

describe("fallbacks", () => {
  it("exposes the admin alert and global reserve defaults", () => {
    expect(adminAlertTemplateId()).toBe(ADMIN_ALERT_TEMPLATE_ID);
    expect(globalFallbackTemplateId()).toBe(GLOBAL_FALLBACK_TEMPLATE_ID);
  });
});

describe("environment overrides", () => {
  it("prefers the language-specific override over the category override", () => {
    setEnv("BREVO_TEMPLATE_LOGIN", "300");
    setEnv("BREVO_TEMPLATE_LOGIN_FR", "301");
    expect(brevoTemplateId("login", "fr")).toBe(301);
    expect(brevoTemplateId("login", "nl")).toBe(300);
  });

  it("ignores empty and non-numeric overrides", () => {
    setEnv("BREVO_TEMPLATE_FORM_EN", "   ");
    expect(brevoTemplateId("form", "en")).toBe(EMAIL_TEMPLATE_IDS.form.en);
    setEnv("BREVO_TEMPLATE_FORM_DE", "not-a-number");
    expect(brevoTemplateId("form", "de")).toBe(EMAIL_TEMPLATE_IDS.form.de);
    setEnv("BREVO_TEMPLATE_FORM_ES", "-4");
    expect(brevoTemplateId("form", "es")).toBe(26);
  });

  it("overrides category fallback, admin alert and global fallback", () => {
    setEnv("BREVO_TEMPLATE_INVITE_FALLBACK", "555");
    setEnv("BREVO_TEMPLATE_ADMIN_ALERT", "556");
    setEnv("BREVO_TEMPLATE_GLOBAL_FALLBACK", "557");
    expect(reserveTemplateId("invite")).toBe(555);
    expect(adminAlertTemplateId()).toBe(556);
    expect(globalFallbackTemplateId()).toBe(557);
  });
});

describe("catalogue", () => {
  it("documents every category exactly once", () => {
    const documented = TEMPLATE_CATALOG.map((e) => e.category);
    expect(new Set(documented).size).toBe(documented.length);
    expect([...documented].sort()).toEqual([...CATEGORIES].sort());
  });

  it("lists at least one param and sender per category", () => {
    for (const entry of TEMPLATE_CATALOG) {
      expect(entry.params.length).toBeGreaterThan(0);
      expect(entry.senders.length).toBeGreaterThan(0);
    }
  });
});
