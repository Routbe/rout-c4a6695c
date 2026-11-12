// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { listMigrationFiles, planMigrations } from "../../../scripts/migration-plan";

const db = new PGlite({ extensions: { pgcrypto, btree_gist } });

// Route the app's tagged-template `sql` to the in-memory database built from db/*.sql.
vi.mock("@/lib/neon", () => ({
  sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, part, i) => acc + (i ? `$${i}` : "") + part, "");
    return (await db.query(text, values)).rows;
  },
}));
vi.mock("@/lib/phone/phone-otp.server", () => ({ phoneStatus: async () => ({ verified: false, configured: false }) }));

const MEMBER = "44444444-4444-4444-8444-444444444444";
const AUTH = "55555555-5555-4555-8555-555555555555";

beforeAll(async () => {
  for (const step of planMigrations(listMigrationFiles("db"), new Set())) {
    if (step.action === "run") await db.exec(`begin;${readFileSync(`db/${step.file}`, "utf8")};commit;`);
  }
  await db.query(`insert into neon_auth."user"(id, name, email, "emailVerified", "createdAt", "updatedAt") values ($1, 'Test', 'factor@example.test', true, now(), now())`, [AUTH]);
  await db.query("insert into public.users(id, email, auth_user_id) values ($1, 'factor@example.test', $2)", [MEMBER, AUTH]);
}, 240_000);
afterAll(async () => { await db.close(); });

it("counts a passkey as two-step verification for the ROUT card", async () => {
  await db.query(`insert into neon_auth.passkey(id, "publicKey", "userId", "credentialID", counter, "deviceType", "backedUp") values ('pk1', 'k', $1, 'c', 0, 'singleDevice', false)`, [AUTH]);
  const { memberHasTwoFactor } = await import("@/lib/wallet/card-owner.server");
  expect(await memberHasTwoFactor(MEMBER)).toBe(true);
  await db.query(`delete from neon_auth.passkey where id = 'pk1'`);
});

it("counts a verified authenticator app as two-step verification", async () => {
  await db.query(`insert into neon_auth."twoFactor"(id, secret, "backupCodes", "userId", verified) values ('tf1', 's', '[]', $1, true)`, [AUTH]);
  const { enrolledFactors } = await import("./step-up.server");
  expect((await enrolledFactors(MEMBER)).totp).toBe(true);
  await db.query(`delete from neon_auth."twoFactor" where id = 'tf1'`);
});

it("does not count an authenticator app whose setup was never confirmed", async () => {
  await db.query(`insert into neon_auth."twoFactor"(id, secret, "backupCodes", "userId", verified) values ('tf2', 's', '[]', $1, false)`, [AUTH]);
  const { memberHasTwoFactor } = await import("@/lib/wallet/card-owner.server");
  expect(await memberHasTwoFactor(MEMBER)).toBe(false);
  await db.query(`delete from neon_auth."twoFactor" where id = 'tf2'`);
});
