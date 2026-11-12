/** Guestbook storage. Server-only. Public reads return pinned notes of public profiles only. */
import { sql } from "@/lib/neon";
import { GUESTBOOK_BURST, GUESTBOOK_PIN_LIMIT, GUESTBOOK_WINDOW_MS, normalizeNote } from "./guestbook-rules";

type Row = Record<string, unknown>;
export type GuestbookNote = { id: string; body: string; pinned: boolean; createdAt: string; author: { username: string | null; displayName: string | null } };

function toNote(r: Row): GuestbookNote {
  return {
    id: String(r["id"]),
    body: String(r["body"]),
    pinned: r["pinned"] === true,
    createdAt: new Date(String(r["created_at"])).toISOString(),
    author: { username: (r["username"] as string) ?? null, displayName: (r["display_name"] as string) ?? null },
  };
}

async function publicOwnerId(handle: string): Promise<string | null> {
  const rows = (await sql`select id from public.profiles
     where lower(username) = lower(${handle})
       and coalesce((display_prefs ->> 'publicProfile')::boolean, true)
       and coalesce((display_prefs ->> 'guestbookEnabled')::boolean, false)
       and coalesce(is_banned, false) = false
       and coalesce(is_suspended, false) = false
       and coalesce(status, 'active') not in ('frozen', 'banned', 'suspended') limit 1`) as Row[];
  return rows[0] ? String(rows[0]["id"]) : null;
}

export async function pinnedNotes(handle: string): Promise<GuestbookNote[]> {
  const owner = await publicOwnerId(handle);
  if (!owner) return [];
  const rows = (await sql`select g.id, g.body, g.pinned, g.created_at, p.username, p.display_name
      from public.guestbook_entries g left join public.profiles p on p.id = g.author_id
     where g.owner_id = ${owner} and g.pinned order by g.created_at desc limit ${GUESTBOOK_PIN_LIMIT}`) as Row[];
  return rows.map(toNote);
}

export async function postNote(authorId: string, handle: string, raw: string): Promise<"ok" | "invalid" | "not_found" | "own_profile" | "too_many" | "not_verified"> {
  const body = normalizeNote(raw);
  if (!body) return "invalid";
  const authors = (await sql`select id from public.profiles
    where id = ${authorId} and verified = true
      and coalesce(is_banned, false) = false
      and coalesce(is_suspended, false) = false
      and coalesce(status, 'active') not in ('frozen', 'banned', 'suspended') limit 1`) as Row[];
  if (!authors[0]) return "not_verified";
  const owner = await publicOwnerId(handle);
  if (!owner) return "not_found";
  if (owner === authorId) return "own_profile";
  const since = new Date(Date.now() - GUESTBOOK_WINDOW_MS).toISOString();
  const c = (await sql`select count(*)::int as n from public.guestbook_entries
     where owner_id = ${owner} and author_id = ${authorId} and created_at > ${since}`) as Row[];
  if (Number(c[0]?.["n"] ?? 0) >= GUESTBOOK_BURST) return "too_many";
  await sql`insert into public.guestbook_entries (owner_id, author_id, body) values (${owner}, ${authorId}, ${body})`;
  return "ok";
}

export async function myInbox(ownerId: string): Promise<GuestbookNote[]> {
  const rows = (await sql`select g.id, g.body, g.pinned, g.created_at, p.username, p.display_name
      from public.guestbook_entries g left join public.profiles p on p.id = g.author_id
     where g.owner_id = ${ownerId} order by g.created_at desc limit 100`) as Row[];
  return rows.map(toNote);
}

export async function setPinned(ownerId: string, id: string, pinned: boolean): Promise<"ok" | "limit"> {
  if (pinned) {
    const c = (await sql`select count(*)::int as n from public.guestbook_entries where owner_id = ${ownerId} and pinned and id <> ${id}`) as Row[];
    if (Number(c[0]?.["n"] ?? 0) >= GUESTBOOK_PIN_LIMIT) return "limit";
  }
  await sql`update public.guestbook_entries set pinned = ${pinned} where id = ${id} and owner_id = ${ownerId}`;
  return "ok";
}

export async function deleteNote(ownerId: string, id: string): Promise<void> {
  await sql`delete from public.guestbook_entries where id = ${id} and owner_id = ${ownerId}`;
}
