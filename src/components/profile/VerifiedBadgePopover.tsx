import { BadgeCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";

/** "Maart 2026" in de actieve taal; leeg wanneer de datum ontbreekt. */
export function monthYear(value: string | null | undefined, locale: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

/**
 * Blauw verificatie-vinkje met popover: wie het aanklikt (of erover hovert)
 * ziet wanneer het lid geverifieerd is en wat die verificatie betekent.
 */
export function VerifiedBadgePopover({
  verifiedAt,
  size = "md",
  cardBg,
  cardBorder,
  textColor,
  mutedColor,
}: {
  verifiedAt: string | null | undefined;
  size?: "sm" | "md";
  cardBg?: string;
  cardBorder?: string;
  textColor?: string;
  mutedColor?: string;
}) {
  const { t, locale } = useI18n();
  const on = monthYear(verifiedAt, locale || "nl");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("profile.verified_badge_title")}
          title={t("profile.verified_badge_title")}
          className="inline-flex items-center transition-opacity hover:opacity-70 focus:outline-none"
        >
          <BadgeCheck
            className={`${size === "md" ? "h-6 w-6" : "h-5 w-5"} text-[#1d9bf0]`}
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-72 rounded-xl border p-4 text-left"
        style={
          cardBg ? { background: cardBg, borderColor: cardBorder, color: textColor } : undefined
        }
      >
        <div className="flex items-start gap-2">
          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1d9bf0]" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-semibold leading-tight">
              {t("profile.verified_badge_title")}
            </p>
            {on && (
              <p className="text-xs" style={mutedColor ? { color: mutedColor } : undefined}>
                {t("profile.verified_on")} {on}
              </p>
            )}
            <p
              className="text-xs leading-relaxed"
              style={mutedColor ? { color: mutedColor } : undefined}
            >
              {t("profile.verified_badge_body")}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
