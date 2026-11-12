import { useTranslation } from "react-i18next";
import { HumanLinkedIcon } from "@/components/profile/HumanLinkedIcon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Privacy-schild badge voor alias-profielen (`rout.be/u/[alias]`).
 *
 * Wordt getoond wanneer het gekoppelde hoofdaccount geverifieerd is
 * (`is_verified === true`): bewijs dat dit account aan een bevestigde mens
 * gekoppeld is — zonder de wettelijke naam te onthullen. Het blauwe vinkje
 * is uitsluitend voorbehouden aan het geverifieerde hoofdprofiel (`/handle`).
 */
export function PrivacyShieldBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const title = t("badges.linkedAccount");
  const iconClass = size === "md" ? "h-6 w-6" : "h-5 w-5";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={title}
          title={title}
          className="inline-flex items-center transition-opacity hover:opacity-70 focus:outline-none"
        >
          <HumanLinkedIcon className={`${iconClass} text-zinc-200`} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="max-w-xs rounded-2xl border border-zinc-700/80 bg-zinc-900/95 p-4 text-left text-xs leading-relaxed text-zinc-300 shadow-2xl"
      >
        <div className="flex items-start gap-2.5">
          <HumanLinkedIcon className="mt-0.5 h-5 w-5 shrink-0 text-zinc-200" aria-hidden />
          <div className="space-y-1.5">
            <p className="text-sm font-bold leading-tight text-zinc-100">{title}</p>
            <p>{t("badges.humanExplanation")}</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
