import { describe, expect, it, afterEach, vi } from "vitest";
import { buildBrevoPayload, mailProvider, sendViaBrevo } from "./brevo-driver";

const base = { from: { name: "ROUT", email: "auth@rout.be" }, to: "a@b.be", replyTo: { email: "hallo@rout.be" }, subject: "S", html: '<a href="https://rout.be/x">x</a>', text: "x", messageId: "<abc@rout.be>", entityRefId: "mail_1" };

describe("brevo driver", () => {
  afterEach(() => { delete process.env["MAIL_PROVIDER"]; vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("never restarts a fresh four-second budget after a timed-out attempt", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: unknown, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
    }));
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    vi.stubGlobal("fetch", fetchMock);
    const delivery = sendViaBrevo("test-key", {}, 4000);
    await vi.advanceTimersByTimeAsync(4000);
    expect((await delivery).sent).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    timeout.mockRestore();
  });
  it("defaults to Infomaniak and uses Brevo only when explicitly selected", () => {
    expect(mailProvider()).toBe("infomaniak");
    process.env["MAIL_PROVIDER"] = "brevo";
    expect(mailProvider()).toBe("brevo");
  });
  it("strips list headers and sets threading ids", () => {
    const p = buildBrevoPayload({ ...base, extraHeaders: { "List-Unsubscribe": "<x>", Precedence: "bulk", "X-Campaign": "1" } });
    const h = p["headers"] as Record<string, string>;
    expect(Object.keys(h).filter((k) => /^(list-|precedence|x-campaign)/i.test(k))).toEqual([]);
    expect(h["X-Entity-Ref-ID"]).toBe("mail_1");
    expect(h["X-Mailin-Track-Opens"]).toBe("0");
    expect(h["X-Mailin-Track-Clicks"]).toBe("0");
    expect(h["Message-ID"]).toBe("<abc@rout.be>");
  });
  it("keeps raw links in html", () => {
    expect(buildBrevoPayload(base)["htmlContent"]).toContain('href="https://rout.be/x"');
  });
});
