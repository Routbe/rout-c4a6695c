import { lookup } from "node:dns/promises";
import { request } from "node:https";
import ipaddr from "ipaddr.js";

export function publicAddress(address: string): boolean {
  try { return ipaddr.process(address).range() === "unicast"; } catch { return false; }
}
/** DNS-pinned HTTPS transport: never re-resolve between validation and connect. */
export async function safeFetch(raw: string, max: number, redirects = 0, allowedHosts?: ReadonlySet<string>): Promise<{ bytes: Buffer; type: string; url: string }> {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || redirects > 4) throw new Error("unsafe");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (allowedHosts && !allowedHosts.has(host.toLowerCase())) throw new Error("unsafe");
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address))) throw new Error("unsafe");
  const pinned = addresses[0];
  if (!pinned) throw new Error("unsafe");
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => req.destroy(new Error("source_timeout")), 30_000);
    const req = request(url, {
      family: pinned.family, autoSelectFamily: false,
      headers: { "user-agent": "ROUT-LinkPreview/1.0 (+https://rout.be)", accept: "*/*" },
      lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
    }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        const location = res.headers.location;
        res.destroy(); clearTimeout(timer);
        if (!location) { reject(new Error("bad_redirect")); return; }
        safeFetch(new URL(location, url).toString(), max, redirects + 1, allowedHosts).then(resolve, reject); return;
      }
      if (status < 200 || status >= 300) { res.destroy(); clearTimeout(timer); reject(new Error("source_unavailable")); return; }
      const chunks: Buffer[] = []; let total = 0;
      res.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > max) { req.destroy(new Error("too_large")); return; }
        chunks.push(chunk);
      });
      res.on("error", reject);
      res.on("end", () => { clearTimeout(timer); resolve({ bytes: Buffer.concat(chunks), type: String(res.headers["content-type"] ?? ""), url: url.toString() }); });
    });
    req.on("error", (error) => { clearTimeout(timer); reject(error); });
    req.end();
  });
}