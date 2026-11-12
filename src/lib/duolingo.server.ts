import { DUOLINGO_USER, parseDuolingo, type DuolingoStatus } from "./duolingo-rules";

/** Public Duolingo profile (no key, no OAuth). Null when unreachable or unknown. Caching happens in integrations.server. */
export async function fetchDuolingo(username: string): Promise<DuolingoStatus | null> {
  if (!DUOLINGO_USER.test(username)) return null;
  try {
    const res = await fetch(`https://www.duolingo.com/2017-06-30/users?username=${encodeURIComponent(username)}`, {
      headers: { accept: "application/json", "user-agent": "rout.be" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return parseDuolingo(await res.json());
  } catch {
    return null;
  }
}
