import { createFileRoute } from "@tanstack/react-router";

/** OpenID Connect RP-Initiated Logout 1.0. */
async function hintAudience(hint: string | null): Promise<string | null> {
  if (!hint) return null;
  const parts = hint.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  const fromB64 = (v: string) => Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  try {
    const header = JSON.parse(new TextDecoder().decode(fromB64(h))) as { alg?: unknown; kid?: unknown };
    const { verificationKey } = await import("@/lib/oauth/keys.server");
    const key = await verificationKey(header);
    if (!key) return null;
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, fromB64(s) as BufferSource,
      new TextEncoder().encode(`${h}.${p}`) as BufferSource);
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64(p))) as Record<string, unknown>;
    const { issuer } = await import("@/lib/oauth/provider.server");
    // Expired hints are allowed by the spec; issuer and audience are not negotiable.
    if (payload["iss"] !== issuer() || typeof payload["aud"] !== "string") return null;
    return payload["aud"];
  } catch {
    return null;
  }
}

const escapeHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Cross-site logout requests get an explicit same-origin confirmation (POST) first. */
function confirmPage(params: URLSearchParams): Response {
  const keep = ["id_token_hint", "post_logout_redirect_uri", "state", "client_id", "ui_locales"];
  const inputs = keep
    .map((k) => [k, params.get(k)] as const)
    .filter((e): e is readonly [string, string] => typeof e[1] === "string" && e[1].length > 0 && e[1].length <= 8192)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
    .join("");
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Afmelden bij ROUT</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:1rem;box-sizing:border-box}main{max-width:24rem;text-align:center}button,a{display:inline-block;margin:.25rem;padding:.6rem 1.1rem;border-radius:.5rem;font:inherit;cursor:pointer}button{border:0;background:CanvasText;color:Canvas}a{border:1px solid currentColor;color:inherit;text-decoration:none}</style></head>
<body><main><h1>Afmelden bij ROUT?</h1><p>Een app vraagt om je af te melden. Bevestig alleen als jij dit wilde.</p>
<form method="post" action="/oauth/end-session">${inputs}<button type="submit">Afmelden</button><a href="/">Annuleren</a></form></main></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function handle(request: Request, params: URLSearchParams): Promise<Response> {
  const { decideEndSessionRedirect, isTrustedLogoutRequest } = await import("@/lib/oauth/end-session-rules");
  const trusted = isTrustedLogoutRequest({
    secFetchSite: request.headers.get("sec-fetch-site"),
    origin: request.headers.get("origin"),
    selfHost: request.headers.get("host") ?? new URL(request.url).host,
  });
  if (!trusted) return confirmPage(params);
  const { getClientByClientId } = await import("@/lib/oauth/provider.server");
  const { APP_SESSION_COOKIE } = await import("@/lib/app-session.server");
  const aud = await hintAudience(params.get("id_token_hint"));
  const client = aud ? await getClientByClientId(aud) : null;
  const decision = decideEndSessionRedirect({
    requested: params.get("post_logout_redirect_uri"),
    state: params.get("state"),
    hintAud: aud,
    clientId: params.get("client_id"),
    registered: client ? client.postLogoutRedirectUris : null,
  });
  const headers = new Headers({ "Cache-Control": "no-store" });
  try {
    const { createRoutAuth } = await import("@/lib/better-auth.server");
    const res = await createRoutAuth(request).api.signOut({ headers: request.headers, asResponse: true });
    for (const c of res.headers.getSetCookie?.() ?? []) headers.append("Set-Cookie", c);
  } catch {
    // No Better Auth session: clearing the ROUT cookie below is still enough.
  }
  headers.append("Set-Cookie", `${APP_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  headers.set("Location", decision.kind === "redirect" ? decision.target : "/");
  return new Response(null, { status: 302, headers });
}

export const Route = createFileRoute("/oauth/end-session")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request, new URL(request.url).searchParams),
      POST: async ({ request }) => handle(request, new URLSearchParams(await request.text())),
    },
  },
});
