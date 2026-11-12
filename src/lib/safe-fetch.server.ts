/**
 * Ophalen van externe pagina's zonder interne netwerken te raken (SSRF).
 * - blokkeert loopback, privé, link-local, CGNAT, multicast en IPv6 ULA/link-local
 * - lost de naam op via DNS-over-HTTPS en controleert elk antwoord
 * - volgt max. 3 redirects handmatig en controleert elke nieuwe host opnieuw
 */

function ipv4Blocked(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p as [number, number, number, number];
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function ipv6Blocked(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v === "::" || v === "::1") return true;
  const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped?.[1]) return ipv4Blocked(mapped[1]);
  const hexMapped = /^(?:0:){0,5}(?:::)?ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(v);
  if (hexMapped?.[1] && hexMapped[2]) {
    const high = parseInt(hexMapped[1], 16), low = parseInt(hexMapped[2], 16);
    return ipv4Blocked(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v);
}

export function ipBlocked(ip: string): boolean {
  return ip.includes(":") ? ipv6Blocked(ip) : ipv4Blocked(ip);
}

async function resolve(host: string, type: "A" | "AAAA", signal?: AbortSignal): Promise<string[]> {
  try {
    const r = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
      { headers: { accept: "application/dns-json" }, signal: signal ?? AbortSignal.timeout(3000) },
    );
    if (!r.ok) return [];
    const j = (await r.json()) as { Answer?: { type: number; data: string }[] };
    const want = type === "A" ? 1 : 28;
    return (j.Answer ?? []).filter((x) => x.type === want).map((x) => x.data);
  } catch {
    return [];
  }
}

export async function assertPublicHost(hostname: string, signal?: AbortSignal): Promise<boolean> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || /\.(local|internal|localhost|lan|home|arpa)$/.test(host))
    return false;
  if (/^\d+$/.test(host) || /^0x/i.test(host)) return false; // decimale/hex IP-trucs
  if (/^[\d.]+$/.test(host) || host.includes(":")) return !ipBlocked(host);
  const answers = await Promise.all([resolve(host, "A", signal), resolve(host, "AAAA", signal)]);
  const ips = answers.flat();
  if (ips.length === 0) return false;
  return ips.every((ip) => !ipBlocked(ip));
}

/** HTTPS-only outbound boundary; redirects must be refused by the caller. */
export async function validateOutboundUrl(raw: string | URL, signal?: AbortSignal): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw Object.assign(new Error("Invalid outbound URL"), { status: 400 }); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !(await assertPublicHost(url.hostname, signal))) {
    throw Object.assign(new Error("Unsafe outbound destination"), { status: 400 });
  }
  return url;
}

export async function safePublicFetch(
  url: URL,
  init: { headers?: Record<string, string> } = {},
): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop <= 3; hop++) {
    if (current.protocol !== "https:" && current.protocol !== "http:") return null;
    if (!(await assertPublicHost(current.hostname))) return null;
    const res = await fetch(current.toString(), {
      method: "GET",
      redirect: "manual",
      headers: init.headers,
      signal: AbortSignal.timeout(8000),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      current = new URL(loc, current);
      continue;
    }
    return res;
  }
  return null;
}
