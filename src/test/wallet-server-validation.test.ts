// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { startWalletTopup, setAutoTopup, creditWallet } from "@/lib/wallet.server";

afterEach(() => vi.unstubAllGlobals());

it("rejects non-tier amounts at the server before database or payment calls", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  for (const amountCents of [999, 1001, 2600, 25001, 1000.5, NaN]) {
    expect(await startWalletTopup({ userId: "test-user", amountCents, origin: "https://rout.be" }))
      .toEqual({ ok: false, reason: "invalid_topup_amount" });
    await expect(setAutoTopup("test-user", true, amountCents)).rejects.toThrow("invalid_topup_amount");
    expect(await creditWallet({ userId: "test-user", amountCents, kind: "topup" })).toBe(false);
  }
  expect(fetch).not.toHaveBeenCalled();
});