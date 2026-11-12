import { describe, expect, it } from "vitest";
import { payerNameFromCharge } from "./stripe-payer-name";

describe("payerNameFromCharge", () => {
  it("neemt de door de bank bevestigde naam bij Bancontact", () => {
    expect(
      payerNameFromCharge({
        payment_method_details: {
          type: "bancontact",
          bancontact: { verified_name: "JAN JANSSENS" },
        },
        billing_details: { name: "Iemand Anders" },
      }),
    ).toEqual({ name: "JAN JANSSENS", source: "bancontact", method: "bancontact" });
  });

  it("negeert de zelf ingevulde naam bij kaartbetalingen", () => {
    const result = payerNameFromCharge({
      payment_method_details: { type: "card", card: { brand: "visa" } },
      billing_details: { name: "Zelf Ingetypt" },
    });
    expect(result.name).toBeNull();
    expect(result.method).toBe("card");
  });

  it("volgt een uitgeklapte latest_charge op een payment intent", () => {
    expect(
      payerNameFromCharge({
        object: "payment_intent",
        latest_charge: {
          payment_method_details: { type: "ideal", ideal: { verified_name: "A. De Vries" } },
        },
      }).name,
    ).toBe("A. De Vries");
  });

  it("geeft niets terug voor SEPA-domiciliëring", () => {
    expect(
      payerNameFromCharge({
        payment_method_details: { type: "sepa_debit", sepa_debit: { last4: "3000" } },
      }).name,
    ).toBeNull();
  });
});
