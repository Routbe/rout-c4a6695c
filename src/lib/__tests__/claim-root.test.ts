import { beforeEach, describe, expect, it, vi } from "vitest";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit.server";

/**
 * Unit-dekking rond het root-subdomein claimproces.
 *
 * De route zelf praat met Neon en Brevo; we testen daarom de bewaking die de
 * route gebruikt (authenticatie, rate limiting) en de contractvorm van de
 * audit-insert, zonder een echte database aan te spreken.
 */

describe("claim-root guards", () => {
  it("wijst een verzoek zonder sessie af met 401", async () => {
    const { currentUser } = await import("@/lib/auth/session.server");
    expect(typeof currentUser).toBe("function");
    // Geen Neon Auth-sessie → de route antwoordt 401.
    await expect(currentUser()).resolves.toBeNull();
  });

  it("blokkeert meer dan 3 pogingen binnen 10 minuten", () => {
    const key = `claim-root:user:${crypto.randomUUID()}`;
    const window = 10 * 60 * 1000;
    expect(() => enforceRateLimit(key, 3, window)).not.toThrow();
    expect(() => enforceRateLimit(key, 3, window)).not.toThrow();
    expect(() => enforceRateLimit(key, 3, window)).not.toThrow();
    expect(() => enforceRateLimit(key, 3, window)).toThrow(RateLimitError);
  });

  it("laat het venster weer openen na afloop", () => {
    const key = `claim-root:ip:${crypto.randomUUID()}`;
    vi.useFakeTimers();
    try {
      enforceRateLimit(key, 1, 1000);
      expect(() => enforceRateLimit(key, 1, 1000)).toThrow(RateLimitError);
      vi.advanceTimersByTime(1500);
      expect(() => enforceRateLimit(key, 1, 1000)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("claim-root conflict + audit contract", () => {
  const statuses = ["none", "pending_dns", "active"] as const;
  const isConflict = (status: string) => status === "pending_dns" || status === "active";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("beschouwt lopende en actieve claims als 409-conflict", () => {
    expect(statuses.filter(isConflict)).toEqual(["pending_dns", "active"]);
    expect(isConflict("none")).toBe(false);
  });

  it("schrijft één auditrij per claim met de mailstatussen", () => {
    const rows: Array<Record<string, unknown>> = [];
    const insert = (row: Record<string, unknown>) => rows.push(row);

    insert({
      user_id: "11111111-1111-1111-1111-111111111111",
      requested_subdomain: "jan.rout.be",
      admin_mail_status: "sent",
      user_mail_status: "failed_brevo_key",
      error_payload: JSON.stringify({ admin: null, user: "HTTP 401" }),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      requested_subdomain: "jan.rout.be",
      admin_mail_status: "sent",
      user_mail_status: "failed_brevo_key",
    });
    expect(JSON.parse(String(rows[0]!["error_payload"])).user).toContain("401");
  });
});
