import { beforeEach, describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { twoFactor } from "better-auth/plugins/two-factor";
import { fediverseSession } from "./fediverse-session";
import { magicLinkTwoFactor, SECOND_FACTOR_PAGE } from "./magic-link-two-factor";

const BASE = "http://localhost:3000";
let db: Record<string, Record<string, unknown>[]>;
beforeEach(() => { db = { user: [], session: [], account: [], verification: [], twoFactor: [] }; });
function makeAuth() {
  return betterAuth({ baseURL: BASE, secret: "test-secret-not-a-production-key".repeat(2), database: memoryAdapter(db),
    rateLimit: { enabled: false }, emailAndPassword: { enabled: true },
    plugins: [fediverseSession(), twoFactor({ allowPasswordless: true }),
      magicLinkTwoFactor({ describe: async () => ({ totp: true, smsTo: null, passkey: false, backupCodes: true }) })],
  });
}
async function ticket(auth: ReturnType<typeof makeAuth>, twoFactorEnabled: boolean, expired = false) {
  const result = await auth.api.signUpEmail({ body: { email: "member@example.invalid", password: "test-password-long-enough", name: "Member" } });
  for (const user of db["user"] ?? []) user["twoFactorEnabled"] = twoFactorEnabled;
  const ctx = await auth.$context;
  await ctx.internalAdapter.deleteUserSessions(result.user.id);
  const value = "12345678-1234-1234-1234-123456789abc";
  await ctx.internalAdapter.createVerificationValue({ identifier: `rout-fedi:${value}`, value: result.user.id, expiresAt: new Date(Date.now() + (expired ? -1000 : 300_000)) });
  return value;
}
function verify(auth: ReturnType<typeof makeAuth>, value: string) {
  return auth.handler(new Request(`${BASE}/api/auth/fediverse/verify?ticket=${value}`, { headers: { origin: BASE } }));
}
describe("restored linked Fediverse sign-in", () => {
  it("establishes a session only once for a linked member without 2FA", async () => {
    const auth = makeAuth(); const value = await ticket(auth, false);
    const response = await verify(auth, value);
    expect(response.headers.get("location")).toBe("/auth/continue");
    expect((db["session"] ?? []).length).toBe(1);
    expect((await verify(auth, value)).status).toBe(401);
    expect((db["session"] ?? []).length).toBe(1);
  });
  it("blocks the session until the member completes configured 2FA", async () => {
    const auth = makeAuth(); const value = await ticket(auth, true);
    const response = await verify(auth, value);
    expect(response.headers.get("location")).toBe(SECOND_FACTOR_PAGE);
    expect((db["session"] ?? []).length).toBe(0);
    expect(response.headers.getSetCookie().some(line => line.includes("two_factor="))).toBe(true);
  });
  it("refuses expired and unknown tickets without creating sessions", async () => {
    const auth = makeAuth(); const value = await ticket(auth, false, true);
    expect((await verify(auth, value)).status).toBe(401);
    expect((await verify(auth, "unknown")).status).toBe(401);
    expect((db["session"] ?? []).length).toBe(0);
  });
});