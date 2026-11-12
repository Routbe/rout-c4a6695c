import { useI18n } from "@/lib/i18n";

/** Shown when the owner has paused (frozen) their own account. */
export function ProfileFrozen({ username }: { username: string }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <h1 className="font-display text-2xl text-foreground">{t("freeze_account.paused_public")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        <span className="font-mono">@{username}</span>
      </p>
    </div>
  );
}
