/**
 * Scheduler authentication for /api/public/cron/* (server-only use).
 * Accepts CRON_SECRET (Vercel sends `Authorization: Bearer $CRON_SECRET`) or
 * LOVABLE_CRON_SECRET, from a header only — never a URL, which ends up in logs.
 * Comparison is constant-time over SHA-256 digests.
 */
async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export function cronSecrets(env: Record<string, string | undefined> = process.env): string[] {
  return [env["CRON_SECRET"], env["LOVABLE_CRON_SECRET"]].filter((s): s is string => typeof s === "string" && s.length > 0);
}

/** null = authorised; otherwise the Response to return (503 unconfigured, 401 wrong/missing). */
export async function cronGuard(request: Request, env: Record<string, string | undefined> = process.env): Promise<Response | null> {
  const secrets = cronSecrets(env);
  if (!secrets.length) return new Response("Not configured", { status: 503 });
  const provided = request.headers.get("x-cron-secret") ?? /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim() ?? "";
  if (!provided) return new Response("Unauthorized", { status: 401 });
  const got = await digest(provided);
  let ok = false;
  for (const s of secrets) ok = equal(got, await digest(s)) || ok;
  return ok ? null : new Response("Unauthorized", { status: 401 });
}
