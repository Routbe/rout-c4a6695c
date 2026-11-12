import { BadgeMedallion } from "@/components/badges/BadgeMedallion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatSerial, type BadgeDef, type UnlockedBadge } from "@/lib/badges";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export type BadgeDialogEntry = (BadgeDef | UnlockedBadge) & {
  awarded_at?: string | null;
  serial_number?: number | null;
};

/**
 * Certificate view of a single badge: rarity, unique serial and the exact
 * award moment. Locked badges show the same sheet without the provenance.
 */
export function BadgeDetailDialog({
  badge,
  unlocked,
  onClose,
}: {
  badge: BadgeDialogEntry | null;
  unlocked: boolean;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  if (!badge) return null;

  const slugKey = badge.slug.replace(/_/g, "-");
  const translated = (field: "name" | "description", fallback: string) => {
    const key = `badges.item.${slugKey}.${field}`;
    const value = t(key);
    return value === key ? fallback : value;
  };

  const rarity = badge.rarity ?? "common";
  const rarityKey = `badges.rarity.${rarity}`;
  const rarityLabel = t(rarityKey) === rarityKey ? rarity : t(rarityKey);
  const serial = formatSerial(badge.serial_number);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgeMedallion
              icon={badge.icon}
              slug={badge.slug}
              color={badge.color}
              rarity={rarity}
              locked={!unlocked}
            />
            {translated("name", badge.name)}
          </DialogTitle>
          <DialogDescription>{translated("description", badge.description)}</DialogDescription>
        </DialogHeader>

        <dl className="space-y-2 text-sm">
          <Row label={t("badges.detail.rarity")} value={rarityLabel} />
          {badge.max_supply ? (
            <Row
              label={t("badges.detail.supply")}
              value={new Intl.NumberFormat(locale === "en" ? "en-GB" : locale).format(
                badge.max_supply,
              )}
            />
          ) : null}
          {unlocked ? (
            <>
              {/* Claimnummer binnen het plafond: "#00042 / 50.000". */}
              <Row
                label={t("badges.detail.serial")}
                value={
                  serial
                    ? badge.max_supply
                      ? `${serial} / ${new Intl.NumberFormat(
                          locale === "en" ? "en-GB" : locale,
                        ).format(badge.max_supply)}`
                      : serial
                    : t("badges.detail.serialPending")
                }
              />
              <Row
                label={t("badges.detail.awarded")}
                value={formatDateTime(badge.awarded_at, locale)}
              />
            </>
          ) : (
            <p className="pt-1 text-xs text-muted-foreground">{t("badges.detail.lockedHint")}</p>
          )}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 last:border-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
