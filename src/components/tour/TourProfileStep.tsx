import { Check, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";

export type HandleState = "idle" | "checking" | "ok" | "taken" | "error";

/** Stap 1: handle, naam en bio — de identiteit, nog zonder account. */
export function TourProfileStep({
  handle,
  displayName,
  bio,
  state,
  reason,
  onHandle,
  onDisplayName,
  onBio,
}: {
  handle: string;
  displayName: string;
  bio: string;
  state: HandleState;
  reason?: string | undefined;
  onHandle: (value: string) => void;
  onDisplayName: (value: string) => void;
  onBio: (value: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t("tour.profile.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("tour.profile.body")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tour-handle">{t("tour.profile.handleLabel")}</Label>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 focus-within:ring-2 focus-within:ring-primary">
          <span className="shrink-0 text-sm text-muted-foreground">rout.be/u/</span>
          <Input
            id="tour-handle"
            value={handle}
            onChange={(e) => onHandle(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t("tour.handleExample")}
            className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
          {state === "checking" && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          )}
          {state === "ok" && <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />}
          {(state === "taken" || state === "error") && (
            <X className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
          )}
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {state === "ok"
            ? t("tour.profile.available")
            : state === "taken"
              ? (reason ?? t("tour.profile.taken"))
              : (reason ?? t("tour.profile.handleHint"))}
        </p>
      </div>


      <div className="space-y-2">
        <Label htmlFor="tour-name">{t("tour.profile.nameLabel")}</Label>
        <Input
          id="tour-name"
          value={displayName}
          onChange={(e) => onDisplayName(e.target.value)}
          placeholder={t("tour.profile.namePlaceholder")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tour-bio">{t("tour.profile.bioLabel")}</Label>
        <Textarea
          id="tour-bio"
          value={bio}
          maxLength={160}
          rows={3}
          onChange={(e) => onBio(e.target.value)}
          placeholder={t("tour.profile.bioPlaceholder")}
        />
        <p className="text-right text-[11px] text-muted-foreground">{bio.length}/160</p>
      </div>
    </div>
  );
}
