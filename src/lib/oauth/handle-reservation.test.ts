import { describe, expect, it } from "vitest";
import { buildReservationClaim, reservableHandle, reservationBinding } from "./handle-reservation";

const ok = { handle: "Anna", accountActive: true, emailConfirmed: true, banned: false, shadowbanned: false, holders: 1 };
const claim = (over: Partial<Parameters<typeof buildReservationClaim>[0]> = {}) =>
  buildReservationClaim({ clientId: "rout_app", sub: "pw_1", facts: ok, verifiedHuman: true, rateLimited: false, nowSec: 1, ...over });

describe("handle reservation", () => {
  it("vouches for the root handle of an active, confirmed account", async () => {
    const c = await claim();
    expect(c.status).toBe("reserved");
    expect(c.handle).toBe("anna");
    expect(c.binding).toBe(await reservationBinding("rout_app", "pw_1", "anna"));
  });
  it("refuses an unconfirmed e-mail", () => expect(reservableHandle({ ...ok, emailConfirmed: false })).toBeNull());
  it("refuses a banned or shadowbanned account", () => {
    expect(reservableHandle({ ...ok, banned: true })).toBeNull();
    expect(reservableHandle({ ...ok, shadowbanned: true })).toBeNull();
  });
  it("refuses a suspended account", () => expect(reservableHandle({ ...ok, accountActive: false })).toBeNull());
  it("refuses a handle that is not unique in ROUT", () => expect(reservableHandle({ ...ok, holders: 2 })).toBeNull());
  it("refuses a member without a handle", () => expect(reservableHandle({ ...ok, handle: null })).toBeNull());
  it("sends no handle when rate limited", async () => {
    const c = await claim({ rateLimited: true });
    expect(c.status).toBe("rate_limited");
    expect(c.handle).toBeUndefined();
  });
  it("binds the handle to this app and this sub", async () => {
    expect(await reservationBinding("rout_app", "pw_1", "anna")).not.toBe(await reservationBinding("rout_other", "pw_1", "anna"));
    expect(await reservationBinding("rout_app", "pw_1", "anna")).not.toBe(await reservationBinding("rout_app", "pw_2", "anna"));
  });
});
