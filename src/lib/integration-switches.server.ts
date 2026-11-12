import { sql } from "@/lib/neon";
import type { SwitchMap, SwitchMode } from "./integration-switches";

type Row = Record<string, unknown>;

/** Reads all switches; fails open (everything on) on db errors. */
export async function readSwitches(): Promise<SwitchMap> {
  try {
    const rows = (await sql`select provider, mode from public.platform_integration_switches`) as Row[];
    const map: SwitchMap = {};
    for (const r of rows) map[String(r["provider"])] = String(r["mode"]) as SwitchMode;
    return map;
  } catch {
    return {};
  }
}

export async function listSwitches() {
  const rows = (await sql`
    select s.provider, s.mode, s.note, s.updated_at, u.email as updated_by_email,
           (select count(*)::int from public.user_integrations i where i.provider = s.provider) as links
      from public.platform_integration_switches s
      left join public.users u on u.id = s.updated_by`) as Row[];
  const counts = (await sql`select provider, count(*)::int as n from public.user_integrations group by provider`) as Row[];
  return {
    switches: rows.map((r) => ({
      provider: String(r["provider"]),
      mode: String(r["mode"]) as SwitchMode,
      note: (r["note"] as string | null) ?? null,
      updatedAt: r["updated_at"] ? String(r["updated_at"]) : null,
      updatedBy: (r["updated_by_email"] as string | null) ?? null,
    })),
    linkCounts: Object.fromEntries(counts.map((r) => [String(r["provider"]), Number(r["n"])])) as Record<string, number>,
  };
}

export async function setSwitch(opts: { adminId: string; provider: string; mode: SwitchMode; note: string | null }) {
  await sql`
    insert into public.platform_integration_switches (provider, mode, note, updated_by, updated_at)
    values (${opts.provider}, ${opts.mode}, ${opts.note}, ${opts.adminId}, now())
    on conflict (provider) do update set mode = excluded.mode, note = excluded.note,
      updated_by = excluded.updated_by, updated_at = now()`;
  const { writeAudit } = await import("./admin.server");
  await writeAudit({ adminId: opts.adminId, action: "integration_switch", targetLabel: `${opts.provider}=${opts.mode}`, notes: opts.note });
}

/** Clears cached status so the next profile view fetches fresh data. */
export async function flushCache(opts: { adminId: string; provider: string }) {
  await sql`update public.user_integrations set status_json = null, status_at = null where provider = ${opts.provider}`;
  if (opts.provider === "spotify") {
    await sql`delete from public.user_music_status`.catch(() => undefined);
  }
  const { writeAudit } = await import("./admin.server");
  await writeAudit({ adminId: opts.adminId, action: "integration_cache_flush", targetLabel: opts.provider });
}
