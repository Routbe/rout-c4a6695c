import { ShieldCheck } from "lucide-react";
import { VerifiedIdentityIcon } from "./VerifiedIdentityIcon";
import { CreatorBadgeIcon } from "@/components/profile/CreatorBadgeIcon";
import { BadgeBackdrop } from "@/components/profile/BadgeBackdrop";
import { DomainBadgeIcon } from "@/components/profile/DomainBadgeIcon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { monthYear } from "@/components/profile/VerifiedBadgePopover";
import { useI18n } from "@/lib/i18n";
import {
  formatBadgeName,
  type BadgeBackdrop as BadgeBackdropStyle,
  type BadgeNameFormat,
  type BadgeType,
} from "@/lib/profile-display";

/**
 * Eén badge, drie betekenissen — vrij te kiezen (of weg te laten):
 *
 *  • `verified` — blauw vinkje: identiteit bevestigd (volledige naam + land)
 *  • `human`    — privacy-schild: bevestigd mens, naam blijft privé
 *  • `domain`   — zwarte domeinbadge: domeinnaam geclaimd via de DNS-zone
 *  • `none`     — geen badge
 *
 * Het achterzetsel (gloed, sticker, randje) houdt het vinkje zichtbaar op elke
 * achtergrond, ook een zwarte.
 */
export function ProfileBadge({
  type,
  verifiedAt,
  legalName,
  country,
  domain,
  nameFormat = "full",
  backdrop = "none",
  backdropColor,
  size = "md",
  cardBg,
  cardBorder,
  textColor,
  mutedColor,
}: {
  type: BadgeType;
  verifiedAt?: string | null;
  legalName?: string | null;
  /** Landcode bij het blauwe vinkje, bv. "BE". */
  country?: string | null;
  /** Geclaimde domeinnaam bij de zwarte domeinbadge. */
  domain?: string | null;
  nameFormat?: BadgeNameFormat;
  backdrop?: BadgeBackdropStyle;
  backdropColor?: string | null;
  size?: "sm" | "md";
  cardBg?: string;
  cardBorder?: string;
  textColor?: string;
  mutedColor?: string;
}) {
  const { t, locale } = useI18n();
  if (type === "none") return null;

  const on = monthYear(verifiedAt, locale || "nl");
  const iconSize = size === "md" ? "h-6 w-6" : "h-5 w-5";

  const title =
    type === "human"
      ? t("badges.humanTitle")
      : type === "domain"
        ? t("badges.businessTitle", { domain: domain ? ` — ${domain}` : "" })
        : type === "influencer"
          ? t("badges.creatorTitle")
          : t("profile.verified_badge_title");

  const body =
    type === "human"
      ? t("badges.humanExplanation")
      : type === "domain"
        ? t("badges.businessExplanation")
        : type === "influencer"
          ? t("badges.creatorExplanation")
          : t("badges.verifiedExplanation");

  const icon = (extra = "") =>
    type === "domain" ? (
      <DomainBadgeIcon className={`${iconSize} ${extra}`} />
    ) : type === "human" ? (
      <ShieldCheck className={`${iconSize} ${extra}`} aria-hidden />
    ) : type === "influencer" ? (
      <CreatorBadgeIcon className={`${iconSize} ${extra}`} />
    ) : (
      <VerifiedIdentityIcon className={`${iconSize} ${extra}`} />
    );

  // Het blauwe vinkje toont bij het openklikken altijd de echte, volledige naam
  // en het land: de weergavenaam mag vrij zijn, de identiteit erachter niet.
  const shownName =
    type === "verified"
      ? (legalName ?? "").trim()
        ? formatBadgeName((legalName ?? "").trim(), nameFormat)
        : ""
      : "";
  const shownCountry = type === "verified" ? (country ?? "").trim().toUpperCase() : "";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={title}
          title={title}
          className="inline-flex items-center transition-opacity hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2"
        >
          <BadgeBackdrop variant={backdrop} color={backdropColor} size={size}>
            {icon()}
          </BadgeBackdrop>
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
          <span className="mt-0.5 shrink-0">{icon()}</span>
          <div className="space-y-1">
            <p className="text-sm font-semibold leading-tight">{title}</p>
            {(shownName || shownCountry) && (
              <p
                className="text-xs font-medium"
                style={mutedColor ? { color: mutedColor } : undefined}
              >
                {[shownName, shownCountry].filter(Boolean).join(" · ")}
              </p>
            )}
            {type === "verified" && on && (
              <p className="text-xs" style={mutedColor ? { color: mutedColor } : undefined}>
                {t("profile.verified_on")} {on}
              </p>
            )}
            <p
              className="text-xs leading-relaxed"
              style={mutedColor ? { color: mutedColor } : undefined}
            >
              {body}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
