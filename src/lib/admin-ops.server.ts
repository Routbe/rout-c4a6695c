import { safeOrTerm } from "@/lib/db/search-term";
/**
 * Server-only helpers for the admin operations console (short links, badges
 * and QR scan counters). Every export assumes the caller was already proven
 * to hold the `admin` role by `admin-ops.functions.ts`.
 *
 * Privacy: scan rows only ever contain a coarse device / browser / OS label —
 * no IP addresses, no user agents, no referrers.
 */
import { dbAdmin } from "@/lib/db/admin.server";

export type AdminShortLink = {
  id: string;
  slug: string;
  label: string | null;
  targetUrl: string;
  isActive: boolean;
  expiresAt: string | null;
  customDomain: string | null;
  createdAt: string;
  userId: string | null;
  scans: number;
};

export async function fetchShortLinks(search: string, limit: number): Promise<AdminShortLink[]> {
  let query = dbAdmin
    .from("tracked_qrs")
    .select(
      "id, slug, label, target_url, is_active, expires_at, custom_domain, created_at, user_id",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  const term = safeOrTerm(search);
  if (term)
    query = query.or(`slug.ilike.%${term}%,label.ilike.%${term}%,target_url.ilike.%${term}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const counts = new Map<string, number>();
  if (rows.length) {
    const { data: scans } = await dbAdmin
      .from("qr_scans")
      .select("tracked_qr_id")
      .in(
        "tracked_qr_id",
        rows.map((r) => r.id),
      );
    for (const s of scans ?? []) {
      counts.set(s.tracked_qr_id, (counts.get(s.tracked_qr_id) ?? 0) + 1);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    label: r.label,
    targetUrl: r.target_url,
    isActive: r.is_active,
    expiresAt: r.expires_at,
    customDomain: r.custom_domain,
    createdAt: r.created_at,
    userId: r.user_id,
    scans: counts.get(r.id) ?? 0,
  }));
}

export async function patchShortLink(
  id: string,
  patch: { slug?: string; label?: string | null; targetUrl?: string; isActive?: boolean },
) {
  const update: {
    updated_at: string;
    slug?: string;
    label?: string | null;
    target_url?: string;
    is_active?: boolean;
  } = { updated_at: new Date().toISOString() };
  if (patch.slug !== undefined) update.slug = patch.slug.toLowerCase();
  if (patch.label !== undefined) update.label = patch.label;
  if (patch.targetUrl !== undefined) update.target_url = patch.targetUrl;
  if (patch.isActive !== undefined) update.is_active = patch.isActive;

  const { error } = await dbAdmin.from("tracked_qrs").update(update).eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

export async function removeShortLink(id: string) {
  await dbAdmin.from("qr_scans").delete().eq("tracked_qr_id", id);
  const { error } = await dbAdmin.from("tracked_qrs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

export type AdminScanSummary = {
  trackedQrId: string;
  slug: string;
  total: number;
  last7Days: number;
  lastScanAt: string | null;
};

export async function fetchScanSummary(trackedQrId: string): Promise<AdminScanSummary> {
  const { data: qr } = await dbAdmin
    .from("tracked_qrs")
    .select("slug")
    .eq("id", trackedQrId)
    .maybeSingle();

  const { data: scans, error } = await dbAdmin
    .from("qr_scans")
    .select("scanned_at")
    .eq("tracked_qr_id", trackedQrId)
    .order("scanned_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);

  const rows = scans ?? [];
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  return {
    trackedQrId,
    slug: qr?.slug ?? "",
    total: rows.length,
    last7Days: rows.filter((r) => new Date(r.scanned_at).getTime() >= cutoff).length,
    lastScanAt: rows[0]?.scanned_at ?? null,
  };
}

/** Corrective action: wipe the scan counter of one code (all rows or a window). */
export async function purgeScans(trackedQrId: string, olderThanDays: number | null) {
  let query = dbAdmin.from("qr_scans").delete().eq("tracked_qr_id", trackedQrId);
  if (olderThanDays !== null) {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 3600 * 1000).toISOString();
    query = query.lt("scanned_at", cutoff);
  }
  const { error } = await query;
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

export type AdminBadge = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  sortOrder: number;
  holders: number;
};

export async function fetchBadges(): Promise<AdminBadge[]> {
  const { data, error } = await dbAdmin
    .from("badges")
    .select("id, slug, name, description, icon, color, sort_order")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  const { data: held } = await dbAdmin.from("user_badges").select("badge_id");
  const counts = new Map<string, number>();
  for (const row of held ?? []) counts.set(row.badge_id, (counts.get(row.badge_id) ?? 0) + 1);

  return (data ?? []).map((b) => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    description: b.description,
    icon: b.icon,
    color: b.color,
    sortOrder: b.sort_order,
    holders: counts.get(b.id) ?? 0,
  }));
}

export async function grantBadge(userId: string, badgeSlug: string, adminId: string) {
  const { data: badge } = await dbAdmin
    .from("badges")
    .select("id")
    .eq("slug", badgeSlug)
    .maybeSingle();
  if (!badge) throw new Error("Unknown badge");

  const { error } = await dbAdmin
    .from("user_badges")
    .upsert(
      { user_id: userId, badge_id: badge.id, awarded_by: adminId },
      { onConflict: "user_id,badge_id" },
    );
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

export async function revokeBadge(userId: string, badgeSlug: string) {
  const { data: badge } = await dbAdmin
    .from("badges")
    .select("id")
    .eq("slug", badgeSlug)
    .maybeSingle();
  if (!badge) throw new Error("Unknown badge");

  const { error } = await dbAdmin
    .from("user_badges")
    .delete()
    .eq("user_id", userId)
    .eq("badge_id", badge.id);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}
