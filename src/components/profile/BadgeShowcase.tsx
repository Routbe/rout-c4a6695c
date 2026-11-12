import { useEffect, useState } from "react";
import { BadgeDetailDialog } from "@/components/badges/BadgeDetailDialog";
import { BadgeMedallion } from "@/components/badges/BadgeMedallion";
import { fetchPublicUserBadges, formatSerial, type UnlockedBadge } from "@/lib/badges";
import { useI18n } from "@/lib/i18n";

/** Public "Badges" strip under the profile header. Renders nothing when empty. */
export function BadgeShowcase({
  userId,
  theme,
}: {
  userId: string;
  theme: { text: string; muted: string; border: string; card: string };
}) {
  const { t } = useI18n();
  const [badges, setBadges] = useState<UnlockedBadge[]>([]);
  const [selected, setSelected] = useState<UnlockedBadge | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicUserBadges(userId).then((b) => !cancelled && setBadges(b));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (badges.length === 0) return null;

  return (
    <section className="mt-6 w-full" aria-label={t("badges.title")}>
      <p
        className="mb-2 text-center text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: theme.muted }}
      >
        {t("badges.title")}
      </p>
      <ul className="flex flex-wrap items-center justify-center gap-2">
        {badges.map((b) => {
          const serial = formatSerial(b.serial_number);
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => setSelected(b)}
                title={b.description}
                aria-label={t("badges.detail.open")}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-opacity hover:opacity-80"
                style={{
                  border: `1px solid ${theme.border}`,
                  background: theme.card,
                  color: theme.text,
                }}
              >
                <BadgeMedallion
                  icon={b.icon}
                  slug={b.slug}
                  color={b.color}
                  rarity={b.rarity ?? "common"}
                  size="sm"
                />
                {b.name}
                {serial ? (
                  <span className="tabular-nums" style={{ color: theme.muted }}>
                    {serial}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <BadgeDetailDialog badge={selected} unlocked onClose={() => setSelected(null)} />
    </section>
  );
}
