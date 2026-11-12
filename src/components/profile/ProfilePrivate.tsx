import { useTranslation } from "react-i18next";
/** Shown to visitors when the owner switched their public profile off. */
export function ProfilePrivate({ username }: { username: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <h1 className="font-display text-2xl text-foreground"> {t("profile.privateTitle")} </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        <span className="font-mono">@{username}</span>
      </p>
    </div>
  );
}
