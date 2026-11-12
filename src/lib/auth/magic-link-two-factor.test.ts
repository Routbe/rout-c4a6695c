import { beforeEach, describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { magicLink } from "better-auth/plugins/magic-link";
import { twoFactor } from "better-auth/plugins/two-factor";
import { magicLinkTwoFactor, SECOND_FACTOR_PAGE } from "./magic-link-two-factor";

/**
 * Real Better Auth instance (in-memory database): an e-mail link must not sign
 * in a member with 2FA switched on until the second step succeeds.
 */
const BASE = "http://localhost:3000";
let db: Record<string, Record<string, unknown>[]>;
let lastLink = "";
let lastOtp = "";

function makeAuth() {
  return betterAuth({
    baseURL: BASE,
    secret: "s".repeat(48),
    database: memoryAdapter(db),
    rateLimit: { enabled: false },
    emailAndPassword: { enabled: true },
    plugins: [
      magicLink({ sendMagicLink: async ({ url }) => { lastLink = url; } }),
      twoFactor({ allowPasswordless: true, otpOptions: { sendOTP: async ({ otp }) => { lastOtp = otp; } } }),
      magicLinkTwoFactor({ describe: async () => ({ totp: false, smsTo: "•••• 1234", passkey: true, backupCodes: false }) }),
    ],
  });
}

function cookiesFrom(res: Response, jar: Map<string, string>) {
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const [name, ...rest] = (pair ?? "").split("=");
    const value = rest.join("=");
    if (!name) continue;
    if (!value || /max-age=0/i.test(line)) jar.delete(name.trim());
    else jar.set(name.trim(), value);
  }
  return jar;
}
const cookieHeader = (jar: Map<string, string>) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

async function call(auth: ReturnType<typeof makeAuth>, path: string, jar: Map<string, string>, body?: unknown) {
  const res = await auth.handler(new Request(path.startsWith("http") ? path : `${BASE}/api/auth${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { origin: BASE, cookie: cookieHeader(jar), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  cookiesFrom(res, jar);
  return res;
}

const hasSession = (jar: Map<string, string>) => [...jar.keys()].some((k) => /session_token$/.test(k));

async function memberWith2fa(auth: ReturnType<typeof makeAuth>, on: boolean) {
  await auth.api.signUpEmail({ body: { email: "lid@example.com", password: "lang-genoeg-wachtwoord", name: "Lid" } });
  for (const u of db["user"]!) u["twoFactorEnabled"] = on;
}

beforeEach(() => {
  db = { user: [], session: [], account: [], verification: [], twoFactor: [] };
  lastLink = "";
  lastOtp = "";
});

describe("second sign-in step after an e-mail link", () => {
  it("signs in directly when 2FA is off", async () => {
    const auth = makeAuth();
    await memberWith2fa(auth, false);
    const jar = new Map<string, string>();
    await call(auth, "/sign-in/magic-link", jar, { email: "lid@example.com", callbackURL: "/dashboard" });
    const res = await call(auth, lastLink, jar);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${BASE}/dashboard`);
    expect(hasSession(jar)).toBe(true);
  });

  it("stops at the second step when 2FA is on, then finishes with an SMS code", async () => {
    const auth = makeAuth();
    await memberWith2fa(auth, true);
    const jar = new Map<string, string>();
    await call(auth, "/sign-in/magic-link", jar, { email: "lid@example.com", callbackURL: "/dashboard" });
    const verify = await call(auth, lastLink, jar);
    expect(verify.status).toBe(302);
    expect(verify.headers.get("location")).toBe(SECOND_FACTOR_PAGE);
    expect(hasSession(jar)).toBe(false);
    expect([...jar.keys()].some((k) => /two_factor$/.test(k))).toBe(true);

    const options = await call(auth, "/two-factor/options", jar);
    expect(await options.json()).toEqual({ pending: true, methods: ["passkey", "sms"], smsTo: "•••• 1234" });

    await call(auth, "/two-factor/send-otp", jar, {});
    expect(lastOtp).toMatch(/^\d{6}$/);
    const wrong = await call(auth, "/two-factor/verify-otp", jar, { code: lastOtp === "000000" ? "111111" : "000000" });
    expect(wrong.status).toBe(401);
    expect(hasSession(jar)).toBe(false);
    const ok = await call(auth, "/two-factor/verify-otp", jar, { code: lastOtp });
    expect(ok.status).toBe(200);
    expect(hasSession(jar)).toBe(true);
  });

  it("password sign-in with 2FA on also stops at the second step", async () => {
    const auth = makeAuth();
    await memberWith2fa(auth, true);
    const jar = new Map<string, string>();
    const res = await call(auth, "/sign-in/email", jar, { email: "lid@example.com", password: "lang-genoeg-wachtwoord" });
    expect(await res.json()).toMatchObject({ twoFactorRedirect: true });
    expect(hasSession(jar)).toBe(false);
  });

  it("refuses the options endpoint without a pending sign-in or session", async () => {
    const auth = makeAuth();
    const res = await call(auth, "/two-factor/options", new Map());
    expect(res.status).toBe(401);
  });
});
