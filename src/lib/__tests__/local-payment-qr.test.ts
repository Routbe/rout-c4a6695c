import { describe, expect, it } from "vitest";
import {
  buildLocalPaymentQr,
  buildPixPayload,
  buildUpiPayload,
  crc16,
} from "@/lib/local-payment-qr";
import {
  hasUsablePaymentDetails,
  isValidIban,
  isValidPixKey,
  isValidRoutingNumber,
  isValidSortCode,
  isValidUpiVpa,
} from "@/lib/payment-validation";

const BE_IBAN = "BE68539007547034";

describe("valuta-specifieke betaal-QR", () => {
  it("bouwt een EPC-QR voor EUR met geldige IBAN", () => {
    const qr = buildLocalPaymentQr({
      beneficiary: "ROUT",
      currency: "EUR",
      amountCents: 399,
      reference: "ROUT-4821",
      iban: BE_IBAN,
      bic: "GKCCBEBB",
    });
    expect(qr?.standard).toContain("EPC");
    expect(qr?.payload).toContain(BE_IBAN);
    expect(qr?.payload).toContain("EUR3.99");
  });

  it("bouwt een Pix BR Code voor BRL met correcte CRC", () => {
    const qr = buildLocalPaymentQr({
      beneficiary: "ROUT België",
      currency: "BRL",
      amountCents: 2500,
      reference: "ROUT-4821",
      pixKey: "pay@rout.be",
      pixCity: "São Paulo",
    });
    expect(qr?.standard).toBe("Pix (BR Code)");
    const payload = qr!.payload;
    expect(payload.startsWith("000201")).toBe(true);
    expect(payload).toContain("BR.GOV.BCB.PIX");
    expect(payload).toContain("5303986");
    expect(payload).toContain("540525.00");
    // Laatste 4 tekens zijn de CRC over al het voorgaande.
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
  });

  it("bouwt een UPI deep link voor INR", () => {
    const qr = buildLocalPaymentQr({
      beneficiary: "ROUT",
      currency: "INR",
      amountCents: 45000,
      reference: "ROUT-4821",
      upiVpa: "rout@okhdfcbank",
    });
    expect(qr?.standard).toBe("UPI");
    expect(qr?.payload.startsWith("upi://pay?")).toBe(true);
    expect(qr?.payload).toContain("pa=rout%40okhdfcbank");
    expect(qr?.payload).toContain("am=450.00");
    expect(qr?.payload).toContain("cu=INR");
  });

  it("geeft lokale instructies voor USD met geldige routinggegevens", () => {
    const qr = buildLocalPaymentQr({
      beneficiary: "ROUT",
      currency: "USD",
      amountCents: 500,
      reference: "ROUT-1",
      accountNumber: "123456789",
      routingNumber: "021000021",
    });
    expect(qr?.payload).toContain("ROUTING:021000021");
    expect(qr?.payload).toContain("CURRENCY:USD");
  });

  it("weigert een QR zonder controleerbare rekeninggegevens", () => {
    expect(
      buildLocalPaymentQr({
        beneficiary: "ROUT",
        currency: "ARS",
        amountCents: 500,
        reference: "ROUT-1",
      }),
    ).toBeNull();
    // USD zonder geldig routingnummer levert eveneens geen QR op.
    expect(
      buildLocalPaymentQr({
        beneficiary: "ROUT",
        currency: "USD",
        amountCents: 500,
        reference: "ROUT-1",
        accountNumber: "123456789",
        routingNumber: "000000000",
      }),
    ).toBeNull();
  });

  it("weigert ongeldige Pix- en UPI-sleutels", () => {
    expect(
      buildPixPayload({
        pixKey: "geen sleutel",
        beneficiary: "ROUT",
        amountCents: 100,
        reference: "R",
      }),
    ).toBeNull();
    expect(
      buildUpiPayload({
        vpa: "rout",
        beneficiary: "ROUT",
        amountCents: 100,
        reference: "R",
      }),
    ).toBeNull();
  });
});

describe("landspecifieke validatie", () => {
  it("valideert IBAN, routingnummer en sort code", () => {
    expect(isValidIban(BE_IBAN)).toBe(true);
    expect(isValidIban("BE68539007547035")).toBe(false);
    expect(isValidRoutingNumber("021000021")).toBe(true);
    expect(isValidRoutingNumber("12345678")).toBe(false);
    expect(isValidSortCode("60-16-13")).toBe(true);
    expect(isValidSortCode("6016")).toBe(false);
  });

  it("valideert Pix-sleutels en UPI-adressen", () => {
    expect(isValidPixKey("pay@rout.be")).toBe(true);
    expect(isValidPixKey("+5511987654321")).toBe(true);
    expect(isValidPixKey("abc")).toBe(false);
    expect(isValidUpiVpa("rout@okhdfcbank")).toBe(true);
    expect(isValidUpiVpa("rout@")).toBe(false);
  });

  it("beoordeelt bruikbaarheid per valuta", () => {
    expect(hasUsablePaymentDetails({ currency: "BRL", pixKey: "pay@rout.be" })).toBe(true);
    expect(hasUsablePaymentDetails({ currency: "INR", upiVpa: "rout@okaxis" })).toBe(true);
    expect(hasUsablePaymentDetails({ currency: "GBP", accountNumber: "12345678" })).toBe(false);
    expect(
      hasUsablePaymentDetails({ currency: "GBP", accountNumber: "12345678", sortCode: "601613" }),
    ).toBe(true);
  });
});
