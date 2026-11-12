import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/badge/verify?username=<handle> — public data for the ROUT web badge.
 * `verified: true` only when the member is a verified human AND the page that
 * asks (Origin, else Referer) is on a domain the member verified in ROUT, or
 * on ROUT itself. No PII: handle, status and the matched host only.
 */
function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=60",
    vary: "Origin, Referer",
    ...(origin && origin !== "null" ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, OPTIONS" } : {}),
  };
}

export const Route = createFileRoute("/api_/badge/verify")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),
      GET: async ({ request }) => {
        const origin = request.headers.get("origin");
        const headers = corsHeaders(origin);
        const { guardRequest } = await import("@/lib/api-guard.server");
        const limited = guardRequest(request, "badge-verify", 120, 60_000);
        if (limited) return limited;
        const raw = new URL(request.url).searchParams.get("username") ?? "";
        const handle = raw.trim().replace(/^@/, "").toLowerCase();
        if (!/^[a-z0-9._-]{2,40}$/.test(handle)) {
          return new Response(JSON.stringify({ valid: false, error: "invalid_username" }), { status: 400, headers });
        }
        const { requestingHost, hostMatchesDomains, ROUT_HOSTS } = await import("@/lib/agent/badge-origin");
        const host = requestingHost(origin, request.headers.get("referer"));
        try {
          const { sql } = await import("@/lib/neon");
          const rows = (await sql`
            select p.id, coalesce(p.verified, false) as verified
              from public.profiles p
             where lower(p.username) = ${handle}
               and coalesce(p.is_banned, false) = false
               and coalesce(p.is_suspended, false) = false
             limit 1
          `) as Record<string, unknown>[];
          const profile = rows[0];
          if (!profile) return new Response(JSON.stringify({ valid: false, error: "not_found" }), { status: 404, headers });
          const domainRows = (await sql`
            select domain from public.custom_domains where user_id = ${profile["id"]} and status = 'verified' limit 50
          `) as { domain: string }[];
          const domains = [...ROUT_HOSTS, ...domainRows.map((d) => d.domain)];
          const originMatches = host !== null && hostMatchesDomains(host, domains);
          const verifiedHuman = profile["verified"] === true;
          return new Response(
            JSON.stringify({
              valid: true,
              username: handle,
              verified: verifiedHuman && originMatches,
              verified_human: verifiedHuman,
              origin_match: originMatches,
              host,
              profile_url: `https://rout.be/${handle}`,
              checked_at: new Date().toISOString(),
            }),
            { status: 200, headers },
          );
        } catch (error) {
          console.error("[badge:verify]", error);
          return new Response(JSON.stringify({ valid: false, error: "temporarily_unavailable" }), { status: 503, headers: { ...headers, "cache-control": "no-store" } });
        }
      },
    },
  },
});
