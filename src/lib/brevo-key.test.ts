import { afterEach, describe, expect, it } from "vitest";
import { brevoKeyStatus, describeBrevoFailure } from "./brevo-key";

const original = process.env["BREVO_API_KEY"];
afterEach(() => {
  if (original === undefined) delete process.env["BREVO_API_KEY"];
  else process.env["BREVO_API_KEY"] = original;
});

describe("brevoKeyStatus", () => {
  it("meldt een ontbrekende sleutel expliciet", () => {
    delete process.env["BREVO_API_KEY"];
    const status = brevoKeyStatus();
    expect(status.key).toBeNull();
    expect(status.error).toMatch(/BREVO_API_KEY ontbreekt/);
  });

  it("weigert een SMTP-sleutel", () => {
    process.env["BREVO_API_KEY"] = "xsmtpsib-abcdefghijklmnop-1234";
    expect(brevoKeyStatus().error).toMatch(/SMTP-sleutel/);
  });

  it("weigert een sleutel met verkeerd formaat", () => {
    process.env["BREVO_API_KEY"] = "not-a-key";
    expect(brevoKeyStatus().error).toMatch(/ongeldig formaat/);
  });

  it("accepteert een geldige v3-sleutel en trimt spaties", () => {
    process.env["BREVO_API_KEY"] = "  xkeysib-0123456789abcdef0123456789  ";
    const status = brevoKeyStatus();
    expect(status.error).toBeNull();
    expect(status.key).toBe("xkeysib-0123456789abcdef0123456789");
  });
});

describe("describeBrevoFailure", () => {
  it("benoemt een ongeldige sleutel bij 401", () => {
    expect(describeBrevoFailure(401, "unauthorized")).toMatch(/ongeldig of ingetrokken/);
  });

  it("valt terug op de ruwe status", () => {
    expect(describeBrevoFailure(400, "bad request")).toMatch(/weigerde het bericht \(400\)/);
  });
});
