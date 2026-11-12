import { assertPublicHost } from "@/lib/safe-fetch.server";
import { linksBackTo, normalizeProfileUrl } from "../relme-rules";

/** Fetches a public https profile page (no redirects, 1 MB cap) and requires a rel="me" link back. */
export async function validateRelMeProof(profileUrl: string, routTargets: string[]) {
  const url = normalizeProfileUrl(profileUrl);
  const parsed = new URL(url);
  if (!(await assertPublicHost(parsed.hostname))) throw new Error("invalid_profile_host");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000), headers: { accept: "text/html" } });
  if (!response.ok) throw new Error("relme_fetch_failed");
  const html = (await response.text()).slice(0, 1_000_000);
  if (!linksBackTo(html, routTargets)) throw new Error("relme_missing");
  return {
    issuer: parsed.origin.toLowerCase(),
    providerSub: url,
    displayHandle: url.replace(/^https:\/\//, ""),
    proofMethod: "rel_me" as const,
    proofDigest: new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${url}\n${html}`))),
  };
}
