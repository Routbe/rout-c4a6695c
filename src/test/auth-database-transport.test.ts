import { afterEach, describe, expect, it, vi } from "vitest";
import { hasDatabase } from "@/lib/neon";
import { createRoutAuth } from "@/lib/better-auth.server";

/**
 * Vercel deploys only set DATABASE_URL (no Lovable connector keys). Sign-in
 * must start with either transport and refuse clearly when neither exists.
 */

function setEnv(values: Record<string, string>) {
  for (const k of ["DATABASE_URL", "NEON_API_KEY", "LOVABLE_API_KEY"]) vi.stubEnv(k, values[k] ?? "");
  vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(40));
}

afterEach(() => vi.unstubAllEnvs());

describe("database transport for sign-in", () => {
  it("DATABASE_URL alone initializes the shared guarded auth adapter", () => {
    setEnv({ DATABASE_URL: "postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/db" });
    expect(hasDatabase()).toBe(true);
    expect(() => createRoutAuth(new Request("https://rout.be/api/auth/get-session"))).not.toThrow();
  });

  it("the Neon connector alone (Lovable preview) counts as a configured database", () => {
    setEnv({ NEON_API_KEY: "lovc_test", LOVABLE_API_KEY: "lov_test" });
    expect(hasDatabase()).toBe(true);
  });

  it("only one connector key is not enough", () => {
    setEnv({ NEON_API_KEY: "lovc_test" });
    expect(hasDatabase()).toBe(false);
  });

  it("no database at all refuses with a DATABASE_URL message", () => {
    setEnv({});
    expect(hasDatabase()).toBe(false);
    expect(() => createRoutAuth()).toThrow(/DATABASE_URL/);
  });
});
