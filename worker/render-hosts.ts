/**
 * Strict parser for OMNI_RENDER_HOSTS (comma-separated exact hostnames).
 * Fail-closed: anything that is not a plain public DNS name is dropped and
 * reported, so a typo can never widen what the sandboxed browser may load.
 */
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export type RenderHosts = { hosts: Set<string>; rejected: string[] };

export function parseRenderHosts(raw: string | undefined): RenderHosts {
  const hosts = new Set<string>();
  const rejected: string[] = [];
  for (const entry of (raw ?? "").split(",")) {
    const value = entry.trim();
    if (!value) continue;
    let host = "";
    try {
      // URL() lower-cases and punycodes IDNs; anything with a scheme, path, port or credentials is refused.
      if (/[/:@*?#\s\\]/.test(value)) throw new Error("not a bare hostname");
      host = new URL(`https://${value}`).hostname.replace(/\.$/, "");
    } catch {
      rejected.push(value);
      continue;
    }
    const labels = host.split(".");
    const ok = host.length <= 253 && labels.length >= 2 && labels.every((l) => LABEL.test(l)) && !IPV4.test(host)
      && !/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/.test(host) && !/^\d+$/.test(labels.at(-1)!);
    if (ok) hosts.add(host); else rejected.push(value);
  }
  return { hosts, rejected };
}

let warned = false;
/** Current allowlist from the environment; rejected entries are logged once per process. */
export function renderHosts(): Set<string> {
  const { hosts, rejected } = parseRenderHosts(process.env.OMNI_RENDER_HOSTS);
  if (rejected.length && !warned) {
    warned = true;
    console.warn(`[render] ignored ${rejected.length} invalid OMNI_RENDER_HOSTS entr${rejected.length === 1 ? "y" : "ies"}: ${rejected.map((r) => JSON.stringify(r.slice(0, 80))).join(", ")}`);
  }
  return hosts;
}

/**
 * Suggested starting value (documented in README): page hosts of the platforms
 * the Studio's link ingest recognises. Their script/API hosts must be added only
 * after testing on the deployment host, because every subresource is checked too.
 */
export const SUGGESTED_RENDER_HOSTS = [
  "www.youtube.com", "m.youtube.com", "youtu.be",
  "www.tiktok.com", "www.instagram.com",
  "x.com", "twitter.com", "bsky.app",
  "open.spotify.com", "music.apple.com", "soundcloud.com", "www.deezer.com",
  "vimeo.com", "www.twitch.tv",
] as const;
