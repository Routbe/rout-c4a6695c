import { describe, expect, it, vi } from "vitest";
import { reportError, type ErrorReport, type ReporterDeps } from "./error-reporter.server";

const base: ErrorReport = {
  errorName: "Error", code: "db_unavailable", status: 503, stack: "at x", userId: "u1", workspaceId: null,
  endpoint: "saveStudioProfile", method: "POST", userAgent: "UA", at: "2026-10-31T00:00:00Z", trigger: "auto",
};

function deps(allowed: boolean[]): ReporterDeps & { send: ReturnType<typeof vi.fn> } {
  let i = 0;
  return {
    send: vi.fn(async () => ({ sent: true })),
    limit: async () => ({ ok: allowed[i++] ?? false }),
    recipient: () => "admin@rout.be",
  } as never;
}

describe("Brevo error reporter", () => {
  it("mails the admin when a save fails, including user and endpoint", async () => {
    const d = deps([true]);
    expect(await reportError(base, d)).toEqual({ sent: true });
    const mail = d.send.mock.calls[0]![0];
    expect(mail.to).toBe("admin@rout.be");
    expect(mail.html).toContain("u1");
    expect(mail.html).toContain("POST saveStudioProfile");
  });
  it("sends at most one automatic mail per error type per window", async () => {
    const d = deps([true, false]);
    await reportError(base, d);
    expect(await reportError(base, d)).toEqual({ sent: false, reason: "rate_limited" });
    expect(d.send).toHaveBeenCalledTimes(1);
  });
  it("user-triggered reports are not blocked by the automatic limit", async () => {
    const d = deps([false]);
    expect((await reportError({ ...base, trigger: "user" }, d)).sent).toBe(true);
  });
  it("escapes HTML in the report", async () => {
    const d = deps([true]);
    await reportError({ ...base, userAgent: "<script>" }, d);
    expect(d.send.mock.calls[0]![0].html).not.toContain("<script>");
  });
});
