import { expect, it } from "vitest";
import { smartLabelSelection } from "./qr-smart-labels";
it("uses the accepted destination and bounded label/CTA for all editor consumers", () => {
  expect(smartLabelSelection({ destination: "https://example.com/event", label: "  Evenement  ", callToAction: "  Schrijf je in  " })).toEqual({ destination: "https://example.com/event", label: "Evenement", callToAction: "Schrijf je in" });
});
it("rejects unsafe destinations before changing the QR", () => {
  expect(() => smartLabelSelection({ destination: "javascript:alert(1)", label: "Test", callToAction: "Scan" })).toThrow();
});