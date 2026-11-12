import { expect, it } from "vitest";
import { docs, docHead, docStructuredData, getDoc } from "@/lib/docs-catalog";
import { PRIMARY_PAYMENT_IDS, qrTypeCategories, allQrTypes } from "@/components/QRTypeSelector";
import { mmToPx } from "@/components/DPISelector";
import { qrGuidePath } from "@/lib/qr-guide-path";
it("restores Steam in both selectable QR catalogs", () => {
  expect(allQrTypes.some(type => type.id === "steam")).toBe(true);
  expect(qrTypeCategories.find(c => c.id === "link")?.types.map(t => t.id)).toEqual(["url", "app", "social", "steam"]);
});
it("restores all payment choices without an extra expansion", () => {
  expect(PRIMARY_PAYMENT_IDS).toEqual(["iban", "wero", "paypal", "crypto"]);
  expect(qrTypeCategories.find(c => c.id === "payment")?.types.map(t => t.id)).toEqual(["iban", "wero", "paypal", "venmo", "cashapp", "pix", "alipay", "wechat", "crypto"]);
});
it("maps supported QR types to actual canonical documents", () => {
  for (const type of ["iban", "wero", "paypal", "crypto", "vcard", "whatsapp", "email", "sms", "pdf", "image", "wifi", "event", "maps"]) expect(getDoc(qrGuidePath(type) ?? "")).toBeDefined();
});
it("generates self-referencing canonicals and matching visible HowTo/FAQ data", () => {
  for (const path of ["/qr-code-generator/payment/wero", "/qr-code-generator/tools/wifi"]) {
    const doc = getDoc(path); if (!doc) throw new Error("Missing golden page");
    expect(docHead(path).links).toEqual([{ rel: "canonical", href: `https://rout.be${path}` }]);
    const graph = docStructuredData(doc)["@graph"];
    expect(graph[0]?.["@type"]).toBe("HowTo");
    expect(graph[0]?.step).toHaveLength(3);
    expect(graph[1]?.["@type"]).toBe("FAQPage");
    expect(graph[1]?.mainEntity).toHaveLength(doc.faqs?.length ?? 0);
  }
});
it("uses the exact Studio millimeter-to-pixel conversion", () => {
  expect(mmToPx(25, 300)).toBe(295);
  expect(mmToPx(55, 300)).toBe(650);
  expect(mmToPx(100, 300)).toBe(1181);
  expect(mmToPx(200, 300)).toBe(2362);
});
it("indexes all new page families once with complete SEO metadata", () => {
  for (const category of ["qr-code-generator", "product", "features", "solutions", "compare", "guide", "support"]) {
    const entries = docs.filter(doc => doc.category === category);
    expect(entries.length).toBeGreaterThan(0);
    for (const doc of entries) { expect(doc.seo_title).toBeTruthy(); expect(doc.seo_description).toBeTruthy(); expect(doc.schema_type).toBeTruthy(); }
  }
  expect(new Set(docs.map(d => d.path)).size).toBe(docs.length);
});