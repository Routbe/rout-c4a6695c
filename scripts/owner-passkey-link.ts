/**
 * Owner bootstrap for passkey-only sign-in. Solves the first-admin
 * chicken-and-egg: recovery links are normally approved by an admin, but the
 * owner cannot sign in to approve their own.
 *
 * Mints ONE single-use, 24 h binding link for an address listed in
 * OWNER_EMAILS (default hallo@rout.be) whose account has no passkey yet. Only
 * the SHA-256 of the token is stored. Opening the link on the admin site lets
 * the owner register a hardware passkey; no password is ever created.
 *
 *   bun scripts/owner-passkey-link.ts --email=hallo@rout.be [--origin=https://rout.dlp.li]
 *
 * Needs the database gateway keys (LOVABLE_API_KEY + NEON_API_KEY), like migrate-gateway.ts.
 * Print the link only to your own terminal and open it yourself.
 */
const URL_ = "https://connector-gateway.lovable.dev/neon/sql";

async function q(query: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const res = await fetch(URL_, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
      "X-Connection-Api-Key": process.env["NEON_API_KEY"] ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, params }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 300)}`);
  return (JSON.parse(text) as { rows: Record<string, unknown>[] }).rows;
}

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const email = (arg("email") ?? "").trim().toLowerCase();
const origin = (arg("origin") ?? process.env["PUBLIC_ORIGIN"] ?? "https://rout.dlp.li").replace(/\/+$/, "");
const owners = (process.env["OWNER_EMAILS"] ?? process.env["ADMIN_EMAIL"] ?? "hallo@rout.be")
  .split(",")
  .map((v) => v.trim().toLowerCase())
  .filter((v) => v.includes("@"));

if (!process.env["LOVABLE_API_KEY"] || !process.env["NEON_API_KEY"]) {
  console.error("Missing LOVABLE_API_KEY or NEON_API_KEY.");
  process.exit(1);
}
if (!email || !owners.includes(email)) {
  console.error(`Refused: --email must be one of the owner addresses (${owners.join(", ")}).`);
  process.exit(1);
}
if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin)) {
  console.error("Refused: --origin must be an https origin.");
  process.exit(1);
}

const users = await q(`select u.id::text as id,
  exists (select 1 from neon_auth.passkey p where p."userId"::text = u.id::text) as has_passkey
  from neon_auth."user" u where lower(u.email) = $1 limit 2`, [email]);
if (users.length !== 1) {
  console.error(users.length ? "Refused: more than one account uses this address." : "No account with this address. Sign up with a passkey instead.");
  process.exit(1);
}
const { id, has_passkey } = users[0] as { id: string; has_passkey: boolean };
if (has_passkey) {
  console.error("This account already has a passkey: sign in with it, then add more under Security.");
  process.exit(1);
}

const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))), (b) => b.toString(16).padStart(2, "0")).join("");

// One open request per account: retire earlier open ones, then issue the approved owner link.
await q(`update public.auth_recovery_requests set status = 'expired', token_hash = null
  where auth_user_id = $1 and status in ('pending', 'approved')`, [id]);
await q(`insert into public.auth_recovery_requests (auth_user_id, email, note, status, decided_at, decision_note, token_hash, token_expires_at)
  values ($1, $2, 'owner bootstrap', 'approved', now(), 'owner bootstrap via CLI (OWNER_EMAILS)', $3, now() + interval '24 hours')`, [id, email, hash]);

console.log("Single-use passkey link (24 h). Open it yourself on the device with your passkey/security key:\n");
console.log(`${origin}/auth/recovery?token=${token}\n`);
