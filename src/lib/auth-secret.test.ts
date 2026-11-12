import { afterEach, expect, it, vi } from "vitest";
import { resolveAuthSecret } from "./better-auth.server";
afterEach(() => vi.unstubAllEnvs());
it("never derives an authentication signing secret from database credentials", () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "");
  vi.stubEnv("AUTH_SECRET", "");
  vi.stubEnv("DATABASE_URL", "database-credential");
  vi.stubEnv("NEON_API_KEY", "connection-credential");
  vi.stubEnv("SESSION_SECRET", "other-secret");
  expect(resolveAuthSecret()).toBeNull();
});
it("accepts a dedicated signing secret only when sufficiently long", () => {
  vi.stubEnv("AUTH_SECRET", "");
  vi.stubEnv("BETTER_AUTH_SECRET", "short");
  expect(resolveAuthSecret()).toBeNull();
  vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(64));
  expect(resolveAuthSecret()).toEqual({ secret: "x".repeat(64), derived: false });
});