import { useI18n } from "@/lib/i18n";
import { Switch } from "@/components/ui/switch";
import { ScopedThemeBar, ThemeScopeSelect } from "@/components/dashboard/editor/ScopedThemeBar";
import { QaAskForm } from "@/components/qa/QaAskForm";
import { QA_PAGE_SURFACE, qaDesign } from "@/lib/qa/design";
import { promptHeadline } from "@/lib/qa/prompts";
import type { ProfileDisplayPrefs } from "@/lib/profile-display";
import type { ThemeScope } from "@/lib/theme-engine";
import { useState } from "react";

export function QaPageDesign({ prefs, setPref, handle, avatarUrl, theme }: {
  prefs: ProfileDisplayPrefs;
  setPref: <K extends keyof ProfileDisplayPrefs>(key: K, value: ProfileDisplayPrefs[K]) => void;
  handle: string;
  avatarUrl: string;
  theme: string;
}) {
  const { t } = useI18n();
  const [scope, setScope] = useState<ThemeScope>("questions");
  const surface = QA_PAGE_SURFACE;
  void theme;
  return <div className="mt-4 grid gap-6 lg:grid-cols-2">
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-medium">Vormgeving vragenpagina</h2><ThemeScopeSelect scope={scope} onChange={setScope} allowedScopes={["questions", "answers"]} /></div>
      <label className="flex items-center justify-between gap-3 text-sm">Profielfoto bovenaan<Switch checked={prefs.qaShowAvatar} onCheckedChange={(v) => setPref("qaShowAvatar", v)} /></label>
      <label className="flex items-center justify-between gap-3 text-sm">Link naar hoofdprofiel<Switch checked={prefs.qaShowProfileLink} onCheckedChange={(v) => setPref("qaShowProfileLink", v)} /></label>
      <ScopedThemeBar prefs={prefs} setPref={setPref} scope={scope} />
    </section>
    <section className="dark min-w-0 space-y-4 bg-gradient-to-b from-story-from to-story-to p-5 text-foreground pt-[max(env(safe-area-inset-top),1.25rem)] pb-[max(env(safe-area-inset-bottom),1.25rem)]" aria-label="Voorbeeld vragenpagina">
      {prefs.qaShowAvatar && avatarUrl && <img src={avatarUrl} alt="" className="mx-auto size-20 rounded-full object-cover" />}
      {prefs.qaShowProfileLink && <p className="text-center text-sm text-muted-foreground">rout.be/{handle}</p>}
      <QaAskForm handle={handle} space="root" headline={promptHeadline(prefs.qaPrompt, prefs.qaPromptCustom, t)} designStyle={qaDesign(prefs, "questions", surface)} preview />
    </section>
  </div>;
}