import { chromium } from "playwright-core";
import { safeFetch, publicAddress } from "./fetch";
import { renderHosts } from "./render-hosts";

/** All page networking is intercepted and fulfilled by DNS-pinned safeFetch.
 * A dead browser proxy blocks routes not handled here; service workers, sockets,
 * media, frames and popups are disabled. Opt in only to approved source hosts.
 */
export async function renderedMetadata(raw: string, transport = safeFetch): Promise<string> {
  const target = new URL(raw);
  const allowedHosts = renderHosts();
  if (!allowedHosts.has(target.hostname.toLowerCase()) || target.protocol !== "https:" || target.username || target.password || (target.port && target.port !== "443")) throw new Error("unsafe");
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    proxy: { server: "http://127.0.0.1:9", bypass: "<-loopback>" },
    args: ["--disable-background-networking", "--disable-quic", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
  });
  try {
    const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
    await context.routeWebSocket("**/*", (socket) => socket.close());
    let requests = 0; let total = 0;
    await context.route("**/*", async (route) => {
      const request = route.request();
      try {
        const url = new URL(request.url());
        const host = url.hostname.replace(/^\[|\]$/g, "");
        if (request.method() !== "GET" || !["document", "script", "xhr", "fetch"].includes(request.resourceType()) ||
          url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
          !allowedHosts.has(host.toLowerCase()) || host === "localhost" || ((/^[\d.]+$/.test(host) || host.includes(":")) && !publicAddress(host)) ||
          ++requests > 40 || total >= 5 * 1024 * 1024) { await route.abort(); return; }
        const result = await transport(url.toString(), Math.min(1024 * 1024, 5 * 1024 * 1024 - total), 0, allowedHosts);
        if (!allowedHosts.has(new URL(result.url).hostname.toLowerCase())) throw new Error("unsafe");
        total += result.bytes.length;
        await route.fulfill({ status: 200, contentType: result.type, body: result.bytes });
      } catch { await route.abort().catch(() => {}); }
    });
    const page = await context.newPage();
    page.on("popup", (popup) => { void popup.close(); });
    await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('meta[property="og:image"]') !== null, undefined, { timeout: 3000 }).catch(() => {});
    // Only title/meta/link metadata crosses back, not the arbitrary rendered DOM.
    return await page.evaluate(() => [document.querySelector("title")?.outerHTML ?? "", ...Array.from(document.querySelectorAll("meta,link[type='application/json+oembed']"), (node) => node.outerHTML)].join("\n").slice(0, 300000));
  } finally { await browser.close(); }
}
export function renderEnabled(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return renderHosts().has(host);
  } catch { return false; }
}