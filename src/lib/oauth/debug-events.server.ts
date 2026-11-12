import { sql } from "@/lib/neon";

/**
 * Live Auth debugger log. Privacy-first: only developer-side facts are kept
 * (endpoint, error code, the redirect URI *path* the app sent, scopes, PKCE
 * presence). Never IPs, user ids, emails, tokens, codes or secrets.
 */
export type DebugEndpoint = "authorize" | "token" | "userinfo";
export type DebugDetail = {
  redirectUri?: string | null;
  scopes?: string[];
  hasPkce?: boolean;
  pkceMethod?: string | null;
  message?: string;
};

const RETENTION_DAYS = 7;

/** Drops query/fragment so no state, codes or user data can slip into the log. */
function redactUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  try {
    const u = new URL(uri);
    return `${u.protocol}//${u.host}${u.pathname}`.slice(0, 300);
  } catch {
    return "(ongeldige URI)";
  }
}

function clean(detail: DebugDetail): DebugDetail {
  return {
    ...(detail.redirectUri !== undefined ? { redirectUri: redactUri(detail.redirectUri) } : {}),
    ...(detail.scopes ? { scopes: detail.scopes.slice(0, 10).map((s) => s.slice(0, 40)) } : {}),
    ...(detail.hasPkce !== undefined ? { hasPkce: detail.hasPkce } : {}),
    ...(detail.pkceMethod !== undefined ? { pkceMethod: detail.pkceMethod?.slice(0, 10) ?? null } : {}),
    ...(detail.message ? { message: detail.message.slice(0, 200) } : {}),
  };
}

/** Fire-and-forget: never throws, never blocks the OAuth flow. */
export function logOAuthEvent(
  clientId: string | null | undefined,
  endpoint: DebugEndpoint,
  outcome: "success" | "error",
  errorCode: string | null,
  detail: DebugDetail = {},
): void {
  if (!clientId || clientId.length > 100) return;
  void (async () => {
    try {
      await sql`insert into public.oauth_debug_events (client_id, endpoint, outcome, error_code, detail)
        values (${clientId}, ${endpoint}, ${outcome}, ${errorCode}, ${JSON.stringify(clean(detail))}::jsonb)`;
      if (Math.random() < 0.02) await purgeOldDebugEvents();
    } catch (error) {
      console.warn("[oauth-debug] log failed", (error as Error).message);
    }
  })();
}

export async function purgeOldDebugEvents() {
  await sql`delete from public.oauth_debug_events
    where created_at < now() - make_interval(days => ${RETENTION_DAYS})`;
}

export type DebugEvent = {
  id: string;
  endpoint: string;
  outcome: string;
  errorCode: string | null;
  detail: DebugDetail;
  createdAt: string;
};

export async function listDebugEvents(clientId: string, errorsOnly: boolean): Promise<DebugEvent[]> {
  const rows = (errorsOnly
    ? await sql`select * from public.oauth_debug_events where client_id = ${clientId} and outcome = 'error'
        and created_at > now() - interval '7 days' order by created_at desc limit 100`
    : await sql`select * from public.oauth_debug_events where client_id = ${clientId}
        and created_at > now() - interval '7 days' order by created_at desc limit 100`) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r["id"]),
    endpoint: String(r["endpoint"]),
    outcome: String(r["outcome"]),
    errorCode: (r["error_code"] as string | null) ?? null,
    detail: (r["detail"] as DebugDetail) ?? {},
    createdAt: new Date(r["created_at"] as string).toISOString(),
  }));
}

/** Recent events across several of the caller's own apps (API activity view). */
export async function listDebugEventsForClients(clientIds: string[]): Promise<(DebugEvent & { clientId: string })[]> {
  if (!clientIds.length) return [];
  const rows = (await sql`select * from public.oauth_debug_events where client_id = any(${clientIds})
      and created_at > now() - interval '7 days' order by created_at desc, id desc limit 50`) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r["id"]),
    clientId: String(r["client_id"]),
    endpoint: String(r["endpoint"]),
    outcome: String(r["outcome"]),
    errorCode: (r["error_code"] as string | null) ?? null,
    detail: (r["detail"] as DebugDetail) ?? {},
    createdAt: new Date(r["created_at"] as string).toISOString(),
  }));
}
