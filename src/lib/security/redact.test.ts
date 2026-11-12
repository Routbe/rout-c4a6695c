import { describe, expect, it } from "vitest";
import { maskEmail, maskEmailsInText, redactLogPayload } from "./redact";

describe("maskEmail", () => {
  it("maskeert het lokale deel maar houdt het domein leesbaar", () => {
    expect(maskEmail("jonas@rout.be")).toBe("j***s@rout.be");
  });

  it("maskeert korte lokale delen", () => {
    expect(maskEmail("ab@example.com")).toBe("a***b@example.com");
  });
});

describe("maskEmailsInText", () => {
  it("maskeert e-mailadressen in vrije tekst", () => {
    expect(maskEmailsInText("login voor piet.janssen@bedrijf.nl mislukt")).toBe(
      "login voor p***n@bedrijf.nl mislukt",
    );
  });
});

describe("redactLogPayload", () => {
  it("redacteert gevoelige sleutels volledig", () => {
    const out = redactLogPayload({
      client_secret: "super-geheim",
      access_token: "tok_123",
      api_key: "key_abc",
      stripe_client_id: "ca_123",
      mollie_profile: "pfl_1",
      authorization: "Bearer x",
      password: "hunter2",
    }) as Record<string, unknown>;
    for (const v of Object.values(out)) expect(v).toBe("[redacted]");
  });

  it("redacteert geneste gevoelige sleutels", () => {
    const out = redactLogPayload({
      response: { Token: { id: "tok" }, user: "ok" },
    }) as { response: Record<string, unknown> };
    expect(out.response["Token"]).toBe("[redacted]");
    expect(out.response["user"]).toBe("ok");
  });

  it("maskeert e-mails in stringwaarden maar laat de rest staan", () => {
    const out = redactLogPayload({
      status: 402,
      message: "betaling voor klant@shop.eu geweigerd",
    }) as { status: number; message: string };
    expect(out.status).toBe(402);
    expect(out.message).toBe("betaling voor k***t@shop.eu geweigerd");
  });

  it("laat ongevoelige structuren ongemoeid", () => {
    const input = { step: "pay", ok: true, items: [1, 2, 3], meta: { count: 2 } };
    expect(redactLogPayload(input)).toEqual(input);
  });
});

describe("IBAN-masking", () => {
  it("maskeert compacte en gegroepeerde IBAN's in tekst", async () => {
    const { maskIbansInText, redactText } = await import("./redact");
    expect(maskIbansInText("naar NL91ABNA0417164300 ok")).toBe("naar NL91***00 ok");
    expect(maskIbansInText("BE68 5390 0754 7034")).toBe("BE68***34");
    expect(redactText("NL91ABNA0417164300 / jonas@rout.be")).toBe("NL91***00 / j***s@rout.be");
  });

  it("maskeert IBAN-waarden onder niet-gevoelige sleutels en houdt aliassen verborgen", () => {
    const out = redactLogPayload({
      MonetaryAccountBank: {
        id: 12,
        description: "Hoofdrekening NL91ABNA0417164300",
        alias: [{ type: "IBAN", value: "NL91ABNA0417164300", name: "ROUT BV" }],
      },
    }) as { MonetaryAccountBank: { id: number; description: string; alias: unknown } };
    expect(out.MonetaryAccountBank.id).toBe(12);
    expect(out.MonetaryAccountBank.description).toBe("Hoofdrekening NL91***00");
    expect(out.MonetaryAccountBank.alias).toBe("[redacted]");
    expect(JSON.stringify(out)).not.toContain("0417164300");
  });
});
