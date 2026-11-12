import { useTranslation } from "react-i18next";
/** Shown when moderation has suspended a public profile. */
export function ProfileSuspended({ username }: { username: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <h1 className="font-display text-2xl text-foreground"> {t("profile.suspendedTitle")} </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
         {t("profile.suspendedPrefix")} <span className="font-mono">@{username}</span>  {t("profile.suspendedBody")} </p>
      <a href="/contact" className="mt-2 text-sm font-medium underline underline-offset-4">
         {t("profile.contactSupport")} </a>
    </div>
  );
}
