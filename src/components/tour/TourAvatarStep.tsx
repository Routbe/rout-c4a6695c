import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";

/** Stap 6: profielfoto — een URL volstaat; uploaden kan later in de Studio. */
export function TourAvatarStep({
  avatarUrl,
  displayName,
  onAvatarUrl,
}: {
  avatarUrl: string;
  displayName: string;
  onAvatarUrl: (value: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t("tour.avatar.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("tour.avatar.body")}</p>
      </div>

      <div className="flex items-center gap-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-lg font-semibold">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            (displayName.trim()[0] ?? "R").toUpperCase()
          )}
        </span>
        <div className="w-full space-y-2">
          <Label htmlFor="tour-avatar">{t("tour.avatar.urlLabel")}</Label>
          <Input
            id="tour-avatar"
            value={avatarUrl}
            onChange={(e) => onAvatarUrl(e.target.value)}
            placeholder={t("tour.avatar.placeholder")}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
