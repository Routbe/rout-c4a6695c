/** Finds a block on a public profile so public widgets only act on owner-published config. */
export async function findPublicBlock(username: string, blockId: string, kind: string): Promise<{ value: string } | null> {
  const { readPublicProfile } = await import("./studio-profile.server");
  const profile = (await readPublicProfile(username)) as Record<string, unknown> | null;
  const blocks = Array.isArray(profile?.["blocks"]) ? (profile!["blocks"] as unknown[]) : [];
  for (const b of blocks) {
    const r = b as Record<string, unknown>;
    if (r && String(r["id"]) === blockId && r["kind"] === kind) return { value: typeof r["value"] === "string" ? r["value"] : "" };
  }
  return null;
}
