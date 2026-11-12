/** Explicit preview-only fixture. No bypass, no plaintext credentials in source or output. */
import { hashPassword } from "better-auth/crypto";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

if (!process.argv.includes("--preview")) throw new Error("Pass --preview only for an isolated preview database.");
const apiKey = process.env.LOVABLE_API_KEY;
const connectionKey = process.env.NEON_API_KEY;
if (!apiKey || !connectionKey) throw new Error("Missing linked Neon credentials.");
async function query(body: object) {
  const response = await fetch("https://connector-gateway.lovable.dev/neon/sql", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "X-Connection-Api-Key": connectionKey ?? "", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { code?: string; message?: string };
    const constraint = error.message?.match(/constraint "([a-z0-9_]+)"/i)?.[1];
    throw new Error(`Preview seed failed (${response.status}, ${error.code ?? "unknown"}${constraint ? `, constraint ${constraint}` : ""}); no credentials logged.`);
  }
  return response.json();
}
const email = "test_preview@rout.be";
const existing = await query({ query: 'select id from neon_auth."user" where lower(email) = $1 limit 1', params: [email] });
if (existing.rows.length) {
  // --rotate: issue fresh disposable credentials, but only for the row this script marked as fixture.
  if (!process.argv.includes("--rotate")) throw new Error("Preview fixture already exists; pass --rotate to issue new disposable credentials.");
  const fixtureId = String(existing.rows[0].id);
  const marked = await query({ query: "select 1 from public.users where id = $1::uuid and user_metadata ->> 'preview_fixture' = 'true'", params: [fixtureId] });
  if (!marked.rows.length) throw new Error("Account with the fixture email is not marked as preview fixture; refusing to touch it.");
  const fresh = randomBytes(32).toString("base64url");
  const updated = await query({ query: `update neon_auth.account set password = $1, "updatedAt" = now() where "userId" = $2::uuid and "providerId" = 'credential'`, params: [await hashPassword(fresh), fixtureId] });
  if (updated.rowCount !== 1) throw new Error("Preview fixture has no single password login; nothing changed.");
  mkdirSync("/tmp/browser/booking", { recursive: true, mode: 0o700 });
  writeFileSync("/tmp/browser/booking/credentials.json", JSON.stringify({ email, password: fresh, userId: fixtureId }), { mode: 0o600 });
  console.log("Preview fixture credentials rotated; saved privately for browser checks.");
  process.exit(0);
}
const id = randomUUID();
const password = randomBytes(32).toString("base64url");
const passwordHash = await hashPassword(password);
await query({ queries: [
  { query: 'insert into neon_auth."user" (id,name,email,"emailVerified","updatedAt") values ($1,$2,$3,true,now())', params: [id, "Preview Test", email] },
  { query: 'insert into neon_auth.account (id,"accountId","providerId","userId",password,"updatedAt") values ($1::uuid,$2::text,\'credential\',$2::uuid,$3,now())', params: [randomUUID(), id, passwordHash] },
  { query: 'insert into public.users (id,email,email_confirmed_at,user_metadata) values ($1,$2,now(),$3::jsonb)', params: [id, email, JSON.stringify({ neon_auth_id: id, full_name: "Preview Test", preview_fixture: true })] },
  { query: 'insert into public.profiles (id,email,username,display_name,verified,verified_at,is_early_verified,preferred_language,blocks) values ($1,$2,$3,$4,true,now(),true,\'nl\',$5::jsonb) on conflict (id) do update set username=excluded.username,display_name=excluded.display_name,verified=true,verified_at=now(),is_early_verified=true,preferred_language=excluded.preferred_language,blocks=excluded.blocks', params: [id, email, "test-preview", "Preview Test", JSON.stringify([{ id: "preview-booking", kind: "booking_request", label: "Preview afspraak", value: JSON.stringify({ title: "Preview afspraak", note: "", duration: 30, mode: "direct", embedUrl: "", showSlots: true, eventTypeId: null }), enabled: true }])] },
] });
mkdirSync("/tmp/browser/booking", { recursive: true, mode: 0o700 });
writeFileSync("/tmp/browser/booking/credentials.json", JSON.stringify({ email, password, userId: id }), { mode: 0o600 });
console.log("Verified preview fixture created; disposable credentials saved privately for browser checks.");