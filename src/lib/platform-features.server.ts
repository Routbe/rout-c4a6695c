import { sql } from "@/lib/neon";
import { FEATURE_DISABLED_MESSAGE, resolvePlatformFeatures, type PlatformFeatureId, type PlatformFeatureMap } from "./platform-features";

type Row = Record<string, unknown>;

/** Short per-instance cache: a switch takes effect everywhere within ~30 s. */
const TTL_MS = 30_000;
let cache: { at: number; map: PlatformFeatureMap } | null = null;

export async function readPlatformFeatures(): Promise<PlatformFeatureMap> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  try {
    const rows = (await sql`select feature, enabled from public.platform_feature_switches`) as Row[];
    const map = resolvePlatformFeatures(rows.map((r) => ({ feature: String(r["feature"]), enabled: r["enabled"] !== false })));
    cache = { at: Date.now(), map };
    return map;
  } catch {
    // Fail open: a storage hiccup must not switch the whole platform off.
    return cache?.map ?? resolvePlatformFeatures([]);
  }
}

export async function isPlatformFeatureEnabled(id: PlatformFeatureId): Promise<boolean> {
  return (await readPlatformFeatures())[id];
}

export class FeatureDisabledError extends Error {
  status = 503;
  constructor() {
    super(FEATURE_DISABLED_MESSAGE);
  }
}

/** Entry-point guard for public and member actions. */
export async function assertPlatformFeature(id: PlatformFeatureId): Promise<void> {
  if (!(await isPlatformFeatureEnabled(id))) throw new FeatureDisabledError();
}

export async function listPlatformFeatureRows() {
  const rows = (await sql`
    select s.feature, s.enabled, s.note, s.updated_at, u.email as updated_by_email
      from public.platform_feature_switches s
      left join public.users u on u.id = s.updated_by
  `) as Row[];
  return rows.map((r) => ({
    feature: String(r["feature"]),
    enabled: r["enabled"] !== false,
    note: (r["note"] as string | null) ?? null,
    updatedAt: r["updated_at"] ? new Date(String(r["updated_at"])).toISOString() : null,
    updatedBy: (r["updated_by_email"] as string | null) ?? null,
  }));
}

export async function setPlatformFeature(opts: { adminId: string; feature: PlatformFeatureId; enabled: boolean; note: string | null }) {
  await sql`
    insert into public.platform_feature_switches (feature, enabled, note, updated_by, updated_at)
    values (${opts.feature}, ${opts.enabled}, ${opts.note}, ${opts.adminId}::uuid, now())
    on conflict (feature) do update set enabled = excluded.enabled, note = excluded.note,
      updated_by = excluded.updated_by, updated_at = now()
  `;
  cache = null;
  const { writeAudit } = await import("./admin.server");
  await writeAudit({
    adminId: opts.adminId,
    action: opts.enabled ? "feature.enable" : "feature.disable",
    targetLabel: opts.feature,
    notes: opts.note,
  }).catch(() => undefined);
}
