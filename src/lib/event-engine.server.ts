import { sql } from "./neon";
import { eventInputSchema, type EventInput, type ProfileEvent, type PublicEvent } from "./event-engine";

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v == null ? null : new Date(String(v)).toISOString());
function dto(r: Row): ProfileEvent {
  return {
    id: String(r.id), title: String(r.title), startsAt: iso(r.starts_at)!, endsAt: iso(r.ends_at),
    venue: String(r.venue ?? ""), description: String(r.description ?? ""), ticketUrl: String(r.ticket_url ?? ""),
    published: r.published === true, slug: String(r.slug),
    profileSpace: r.profile_space as ProfileEvent["profileSpace"], profileHandle: String(r.profile_handle),
  };
}

export async function listEvents(userId: string, workspaceId: string | null): Promise<ProfileEvent[]> {
  const rows = await sql`select * from public.profile_events e
    where (${workspaceId}::uuid is null and e.workspace_id is null and e.user_id=${userId})
       or (${workspaceId}::uuid is not null and e.workspace_id=${workspaceId})
    order by e.starts_at desc limit 200` as Row[];
  return rows.map(dto);
}

export async function createEvent(userId: string, workspaceId: string | null, input: EventInput): Promise<ProfileEvent> {
  const d = eventInputSchema.parse(input);
  if ((d.profileSpace === "workspace") !== (workspaceId !== null)) throw new Error("Forbidden");
  const binding = d.profileSpace === "workspace"
    ? await sql`select 1 from public.workspaces where id=${workspaceId} and slug=${d.profileHandle} limit 1`
    : d.profileSpace === "alias"
      ? await sql`select 1 from public.alias_profiles where user_id=${userId} and handle=${d.profileHandle} limit 1`
      : await sql`select 1 from public.profiles where id=${userId} and username=${d.profileHandle} and workspace_id is null limit 1`;
  if (!binding.length) throw new Error("Forbidden");
  const rows = await sql`insert into public.profile_events(user_id,workspace_id,title,starts_at,ends_at,venue,description,ticket_url,published,profile_space,profile_handle)
    values(${userId},${workspaceId},${d.title},${d.startsAt}::timestamptz,${d.endsAt}::timestamptz,${d.venue},${d.description},${d.ticketUrl},${d.published},${d.profileSpace},${d.profileHandle})
    returning *` as Row[];
  if (!rows[0]) throw new Error("event_save_failed");
  return dto(rows[0]);
}

export async function changeEvent(userId: string, workspaceId: string | null, id: string, action: "publish" | "delete", enabled = false) {
  const rows = action === "delete"
    ? await sql`delete from public.profile_events e where e.id=${id}
        and ((${workspaceId}::uuid is null and e.workspace_id is null and e.user_id=${userId})
          or (${workspaceId}::uuid is not null and e.workspace_id=${workspaceId})) returning e.id`
    : await sql`update public.profile_events e set published=${enabled} where e.id=${id}
        and ((${workspaceId}::uuid is null and e.workspace_id is null and e.user_id=${userId})
          or (${workspaceId}::uuid is not null and e.workspace_id=${workspaceId})) returning e.id`;
  if (!rows.length) throw new Error("Forbidden");
  return { ok: true };
}

export async function readPublicEvents(slug: string | null, space: string | null, handle: string | null): Promise<PublicEvent[]> {
  if (!slug && !(space && handle)) return [];
  const rows = await sql`select public.read_public_events(${slug}, ${space}, ${handle}) as events` as Row[];
  const raw = rows[0]?.events;
  const list = (typeof raw === "string" ? JSON.parse(raw) : raw ?? []) as Record<string, unknown>[];
  return list.map((e) => ({
    id: String(e.id), title: String(e.title), startsAt: iso(e.startsAt)!, endsAt: iso(e.endsAt),
    venue: String(e.venue ?? ""), description: String(e.description ?? ""), ticketUrl: String(e.ticketUrl ?? ""),
    slug: String(e.slug), profileSpace: e.profileSpace as PublicEvent["profileSpace"], profileHandle: String(e.profileHandle),
  }));
}
