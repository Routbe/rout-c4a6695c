// @vitest-environment node
import { describe, expect, it } from "vitest";
import { canUnsubscribeNotification, signUnsubscribeToken, unsubscribeHeaders, verifyUnsubscribeToken } from "./unsubscribe-token";

const secret = "test-only-secret-with-at-least-32-characters";
const userId = "11111111-1111-4111-8111-111111111111";
describe("scoped one-click unsubscribe", () => {
  it("accepts only a signed recipient-bound notification token", async () => {
    const token = await signUnsubscribeToken(userId,secret);
    expect(await verifyUnsubscribeToken(token,secret)).toBe(userId);
    expect(await verifyUnsubscribeToken(token,secret+"wrong")).toBeNull();
    expect(await verifyUnsubscribeToken(token.slice(0,-5)+"xxxxx",secret)).toBeNull();
  });
  it("offers both RFC8058 headers without enabling provider tracking", () => {
    const headers = unsubscribeHeaders("https://rout.be", "signed-token");
    expect(headers["List-Unsubscribe"]).toBe("<https://rout.be/api/public/email/unsubscribe?token=signed-token>");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
  it("keeps login, security and payment mail necessary while allowing notification opt-out", () => {
    for (const category of ["login","security","recovery","payment","deletion"]) expect(canUnsubscribeNotification(category,["notification:event"])).toBe(false);
    expect(canUnsubscribeNotification("node_expiry",["notification:node_expiry_warning"])).toBe(true);
  });
});