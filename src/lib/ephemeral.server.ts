import { sql } from "./neon";
import { statusInput, spotlightCandidates, type StatusInput, type PresenceStory } from "./presence";
import { normalizeSocialGridTarget } from "./social-grid";
import type { ProfileBlock } from "./profile";

export async function publicPresence(handle: string, space: string): Promise<PresenceStory[]> {
  const rows = await sql`select public.rout_presence_public(${handle},${space}) as stories` as Record<string,unknown>[];
  const raw=rows[0]?.["stories"];
  const stories=(typeof raw==="string" ? JSON.parse(raw) : raw) as PresenceStory[] | null;
  return (stories ?? []).flatMap(s => {
    const normalized={...s,createdAt:new Date(s.createdAt).toISOString(),expiresAt:new Date(s.expiresAt).toISOString()};
    if(s.statusType==="omni_drop") { const targetUrl=normalizeSocialGridTarget(s.targetUrl ?? "");return targetUrl ? [{...normalized,targetUrl}] : []; }
    return [normalized];
  });
}
export async function createPresence(owner: string, input: StatusInput): Promise<PresenceStory> {
  const data=statusInput.parse(input);
  if(data.statusType==="omni_drop") {
    const rows=(data.space==="alias" ? await sql`select blocks from public.alias_profiles where user_id=${owner} limit 1` : await sql`select blocks from public.profiles where id=${owner} limit 1`) as Record<string,unknown>[];
    const blocks=rows[0]?.["blocks"] as ProfileBlock[] | undefined;
    if(!spotlightCandidates(blocks ?? []).some(b=>b.blockId===data.payload.blockId && b.itemId===data.payload.itemId)) throw new Error("published_block_required");
  }
  const rows=await sql`insert into public.ephemeral_statuses(id,user_id,space,status_type,content_payload)
    values(${data.id},${owner},${data.space},${data.statusType}::public.presence_status_type,${JSON.stringify(data.payload)}::jsonb)
    on conflict(id) do nothing returning id,created_at,expires_at` as Record<string,unknown>[];
  const row=rows[0] ?? (await sql`select id,created_at,expires_at from public.ephemeral_statuses where id=${data.id} and user_id=${owner}` as Record<string,unknown>[])[0];
  if(!row) throw new Error("status_not_saved");
  const {deliverBroadcasts}=await import("./broadcast.server");const {registerBackgroundTask}=await import("./background-task.server");
  const task=deliverBroadcasts(owner).catch(()=>undefined);if(!registerBackgroundTask(task))await task;
  return {id:String(row["id"]),statusType:data.statusType,...data.payload,createdAt:new Date(String(row["created_at"])).toISOString(),expiresAt:new Date(String(row["expires_at"])).toISOString()};
}
export type MyPulse = { id: string; space: "root" | "alias"; statusType: "micro_text" | "omni_drop"; text: string | null; createdAt: string; expiresAt: string };
/** Owner's own active pulses, newest first (Command Center management). */
export async function listMyPresence(owner: string): Promise<MyPulse[]> {
  const rows = await sql`select id,space,status_type::text as status_type,content_payload->>'text' as text,created_at,expires_at
    from public.ephemeral_statuses where user_id=${owner} and expires_at>now() order by created_at desc limit 50` as Record<string, unknown>[];
  return rows.map(r => ({ id: String(r["id"]), space: r["space"] === "alias" ? "alias" : "root", statusType: r["status_type"] === "omni_drop" ? "omni_drop" : "micro_text",
    text: (r["text"] as string | null) ?? null, createdAt: new Date(String(r["created_at"])).toISOString(), expiresAt: new Date(String(r["expires_at"])).toISOString() }));
}
/** Ends a pulse early; only the owner's own row can match. */
export async function deleteMyPresence(owner: string, id: string): Promise<boolean> {
  const rows = await sql`delete from public.ephemeral_statuses where id=${id} and user_id=${owner} returning id` as unknown[];
  return rows.length > 0;
}
