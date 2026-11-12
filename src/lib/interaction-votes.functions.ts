import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Poll-stemmen — publiek (geen login nodig). De `voter_key` is een anonieme,
 * in localStorage gegenereerde id; de unique constraint op
 * (poll_key, voter_key) maakt dubbel stemmen onmogelijk.
 */
export const getPollResults = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ pollKey: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }): Promise<{ counts: number[] }> => {
    const { sql } = await import("@/lib/neon");
    const rows = await sql.query(
      `select option_index, count(*)::int as n
       from public.poll_votes where poll_key = $1
       group by option_index order by option_index`,
      [data.pollKey],
    );
    const counts = new Array<number>(6).fill(0);
    for (const r of rows as { option_index: number; n: number }[]) {
      if (r.option_index >= 0 && r.option_index < 6) counts[r.option_index] = r.n;
    }
    return { counts };
  });

export const votePoll = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        pollKey: z.string().min(1).max(200),
        optionIndex: z.number().int().min(0).max(5),
        voterKey: z.string().min(8).max(80),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; counts: number[] }> => {
    const { sql } = await import("@/lib/neon");
    // Only polls published on a public profile, only their real options.
    const sep = data.pollKey.indexOf(":");
    const username = sep > 0 ? data.pollKey.slice(0, sep) : "";
    const blockId = sep > 0 ? data.pollKey.slice(sep + 1) : "";
    const { findPublicBlock } = await import("./public-block.server");
    const block = username && blockId ? await findPublicBlock(username, blockId, "live_poll") : null;
    if (!block) throw new Error("Poll not found");
    const { parsePollConfig } = await import("./interactions");
    if (data.optionIndex >= parsePollConfig(block.value).options.length) throw new Error("Invalid option");
    // Voter identity is derived server-side; the client-supplied key is ignored.
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const ip = (getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-real-ip") ?? getRequestHeader("x-forwarded-for") ?? "").split(",")[0]!.trim();
    if (!ip) throw new Error("Vote could not be verified");
    const pepper = process.env.BETTER_AUTH_SECRET ?? "";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`poll:${pepper}:${data.pollKey}:${ip}`));
    const serverVoterKey = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 64);
    await sql.query(
      `insert into public.poll_votes (poll_key, option_index, voter_key)
       values ($1, $2, $3) on conflict (poll_key, voter_key) do nothing`,
      [data.pollKey, data.optionIndex, serverVoterKey],
    );
    const rows = await sql.query(
      `select option_index, count(*)::int as n
       from public.poll_votes where poll_key = $1
       group by option_index order by option_index`,
      [data.pollKey],
    );
    const counts = new Array<number>(6).fill(0);
    for (const r of rows as { option_index: number; n: number }[]) {
      if (r.option_index >= 0 && r.option_index < 6) counts[r.option_index] = r.n;
    }
    return { ok: true, counts };
  });
