import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/db/client";
import { getMyAccount } from "@/lib/account.functions";
import { BadgeDetailDialog, type BadgeDialogEntry } from "@/components/badges/BadgeDetailDialog";
import { BadgeMedallion } from "@/components/badges/BadgeMedallion";
import { fetchBadgeCatalogue, fetchUserBadges, formatSerial, type BadgeDef } from "@/lib/badges";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** "Unlocked Badges" grid in the Profile Hub — locked entries stay visible as goals. */
export function BadgesPanel() {
  const { user } = useAuth();
  const { t } = useI18n();
  const loadAccount = useServerFn(getMyAccount);
  const [catalogue, setCatalogue] = useState<BadgeDef[]>([]);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [grants, setGrants] = useState<
    Record<string, { awarded_at: string | null; serial_number?: number | null }>
  >({});
  const [selected, setSelected] = useState<BadgeDialogEntry | null>(null);
  const [derived, setDerived] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = () =>
      void Promise.all([fetchBadgeCatalogue(), fetchUserBadges(user.id), loadAccount()]).then(
        ([all, mine, me]) => {
          if (cancelled) return;
          setCatalogue(all);
          setUnlocked(new Set(mine.map((b) => b.slug)));
          setGrants(
            Object.fromEntries(
              mine.map((b) => [
                b.slug,
                { awarded_at: b.awarded_at, serial_number: b.serial_number },
              ]),
            ),
          );

          // Live status badges are derived from the profile itself, so a paid or
          // Bluesky-verified member never sees their own badge as locked.
          const auto = new Set<string>();
          if (me.isPaid || me.isEarlyBeliever) {
            auto.add("early-believer");
            auto.add("early_believer");
          }
          if (me.verified) auto.add("verified");
          if (me.blueskyDid) auto.add("bluesky");
          if (me.tier === "founder") auto.add("founder");
          setDerived(auto);
        },
      );

    load();

    // Badge state is DB truth: a payment webhook, admin grant or Bluesky link
    // must light the badge up without a page refresh.
    const channel = db
      .channel(`badges-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_badges", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void db.removeChannel(channel);
    };
  }, [user, loadAccount]);

  /** DB copy is the fallback; a translated override wins when it exists. */
  const label = (slug: string, field: "name" | "description", fallback: string) => {
    const key = `badges.item.${slug.replace(/_/g, "-")}.${field}`;
    const value = t(key);
    return value === key ? fallback : value;
  };

  const isUnlocked = (slug: string) => {
    if (unlocked.has(slug)) return true;
    const key = slug.replace(/_/g, "-");
    return derived.has(slug) || derived.has(key) || [...derived].some((d) => key.includes(d));
  };

  if (catalogue.length === 0) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">{t("badges.title")}</h2>
        <span className="text-xs text-muted-foreground">
          {catalogue.filter((b) => isUnlocked(b.slug)).length} / {catalogue.length}
        </span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {catalogue.map((b) => {
          const has = isUnlocked(b.slug);
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => setSelected({ ...b, ...(grants[b.slug] ?? {}) })}
                aria-label={t("badges.detail.open")}
                className={cn(
                  "flex w-full items-start gap-2 rounded-xl border p-3 text-left transition-colors hover:bg-muted/50",
                  has ? "border-foreground/30 bg-background" : "border-border opacity-60",
                )}
              >
                <BadgeMedallion
                  icon={b.icon}
                  slug={b.slug}
                  color={b.color}
                  rarity={b.rarity ?? "common"}
                  locked={!has}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{label(b.slug, "name", b.name)}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {label(b.slug, "description", b.description)}
                  </span>
                  {has && formatSerial(grants[b.slug]?.serial_number) ? (
                    <span className="mt-0.5 block text-[11px] font-medium tabular-nums">
                      {formatSerial(grants[b.slug]?.serial_number)}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <BadgeDetailDialog
        badge={selected}
        unlocked={selected ? isUnlocked(selected.slug) : false}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}
