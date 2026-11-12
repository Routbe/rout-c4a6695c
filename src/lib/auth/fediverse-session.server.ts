/** Never resolve ownership by email or handle: only an OAuth-verified immutable subject. */
export async function federatedSignInResponse(request: Request, provider: "bluesky" | "mastodon", subject: string): Promise<Response> {
  const { sql, withDbContext } = await import("@/lib/neon");
  const rows = await sql.query("select user_id from public.user_identities where provider = $1 and provider_account_id = $2 limit 1", [provider, subject]);
  const memberId = rows[0]?.user_id;
  if (typeof memberId !== "string") return new Response(null, { status: 303, headers: { location: "/auth/sign-in?error=account_not_linked", "cache-control": "no-store" } });
  const linked = await withDbContext({ userId: memberId, workspaceId: null }, () => sql.query("select coalesce(auth_user_id::text, user_metadata->>'neon_auth_id') as auth_id from public.users where id = $1::uuid and coalesce(is_disabled,false) = false limit 1", [memberId]));
  const authId = linked[0]?.auth_id;
  if (typeof authId !== "string") return new Response(null, { status: 303, headers: { location: "/auth/sign-in?error=account_not_linked", "cache-control": "no-store" } });
  const { createRoutAuth } = await import("@/lib/better-auth.server");
  const auth = await createRoutAuth(request).$context;
  const ticket = crypto.randomUUID();
  await auth.internalAdapter.createVerificationValue({ identifier: `rout-fedi:${ticket}`, value: authId, expiresAt: new Date(Date.now() + 300_000) });
  return new Response(null, { status: 303, headers: { location: `/api/auth/fediverse/verify?ticket=${ticket}`, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}