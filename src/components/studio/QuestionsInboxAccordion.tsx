import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ShieldCheck, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QA_PROMPT_CUSTOM_MAX, QA_PROMPT_KEYS, promptHeadline, type QaPromptKey } from "@/lib/qa/prompts";
import { QaInbox } from "@/components/qa/QaInbox";
import { QaMutedList } from "@/components/qa/QaMutedList";
import { QaShareDialog } from "@/components/qa/QaShareDialog";
import { qaPaths, type QaSpace } from "@/components/qa/useQaPublic";
import { cn } from "@/lib/utils";
import type { ProfileDisplayPrefs } from "@/lib/profile-display";
import { StudioSectionIcon } from "./StudioSectionIcon";
import { StudioToggleCard } from "./StudioToggleCard";

export type QaPrefs = Pick<ProfileDisplayPrefs, "questionsEnabled" | "qaPrompt" | "qaPromptCustom" | "qaOnHub" | "qaPage" | "qaAudience" | "qaIntroSeen">;

/**
 * Studio: anonymous Q&A for one canvas — accept on/off, hub block and/or a
 * dedicated /ask page, the NGL-style prompt, the story-card generator and the
 * Void Inbox. Settings are profile prefs, so they go live on publish.
 */
export function QuestionsInboxAccordion({ space, handle, displayName, avatarUrl, prefs, onPref }: {
  space: QaSpace;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  prefs: QaPrefs;
  onPref: <K extends keyof QaPrefs>(key: K, value: ProfileDisplayPrefs[K]) => void;
}) {
  const { t } = useI18n();
  const [shareOpen, setShareOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  useEffect(() => { if (prefs.questionsEnabled && !prefs.qaIntroSeen) setIntroOpen(true); }, [prefs.questionsEnabled, prefs.qaIntroSeen]);
  const headline = promptHeadline(prefs.qaPrompt, prefs.qaPromptCustom, t);
  const paths = handle ? qaPaths(handle, space) : null;
  const keys: QaPromptKey[] = [...QA_PROMPT_KEYS, "custom"];
  const shareTarget = useMemo(() => (shareOpen ? { kind: "prompt" as const, prompt: headline } : null), [shareOpen, headline]);


  return (
    <>
    <StudioToggleCard
      unframed
      id="studio-qa"
      icon={<StudioSectionIcon kind="questions" />}
      title={t("pages.qa.inbox.title")}
      subtitle={headline}
      checked={prefs.questionsEnabled && prefs.qaOnHub}
      onCheckedChange={(v) => { if (v && !prefs.qaIntroSeen) setIntroOpen(true); onPref("questionsEnabled", v || prefs.qaPage); onPref("qaOnHub", v); }}
    >
      <div className="space-y-3">
        <label className="block space-y-2 text-sm">
          <span>{t("pages.qa.settings.audience")}</span>
          <Select value={prefs.qaAudience} onValueChange={(v) => onPref("qaAudience", v as QaPrefs["qaAudience"])}>
            <SelectTrigger aria-label={t("pages.qa.settings.audience")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="members_only">{t("pages.qa.settings.members")}</SelectItem>
              <SelectItem value="verified_only">{t("pages.qa.settings.verified")}</SelectItem>
              <SelectItem value="public_unrestricted">{t("pages.qa.settings.everyone")}</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <fieldset className="space-y-2 rounded-xl border border-border p-3">
          <legend className="px-1 text-sm font-medium">{t("pages.qa.settings.prompt")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {keys.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onPref("qaPrompt", k)}
                aria-pressed={prefs.qaPrompt === k}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-xs transition-colors",
                  prefs.qaPrompt === k ? "border-story-ring bg-story-ring/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`pages.qa.prompt.${k}`)}
              </button>
            ))}
          </div>
          {prefs.qaPrompt === "custom" && (
            <input
              value={prefs.qaPromptCustom ?? ""}
              onChange={(e) => onPref("qaPromptCustom", e.target.value.slice(0, QA_PROMPT_CUSTOM_MAX) || null)}
              maxLength={QA_PROMPT_CUSTOM_MAX}
              placeholder={t("pages.qa.settings.customPlaceholder")}
              aria-label={t("pages.qa.settings.customPlaceholder")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          )}
          <p className="text-[11px] text-muted-foreground">{t("pages.qa.settings.publishHint")}</p>
        </fieldset>

        {paths && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => setShareOpen(true)}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden />{t("pages.qa.settings.shareCard")}
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <a href={prefs.qaPage ? paths.ask : paths.profile} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" aria-hidden />rout.be{prefs.qaPage ? paths.ask : paths.profile}</a>
            </Button>
          </div>
        )}

        <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{t("pages.qa.settings.safety")}
        </p>

        <QaInbox space={space} />

        <QaMutedList />
      </div>
      <Dialog open={introOpen} onOpenChange={setIntroOpen}>
        <DialogContent><DialogHeader><DialogTitle>{t("pages.qa.intro.title")}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>{t("pages.qa.intro.audience")}</p>
            <p>{t("pages.qa.intro.answers")}</p>
            <p>{t("pages.qa.intro.mute")}</p>
            <p>{t("pages.qa.intro.publish")}</p>
          </div>
          <Button onClick={() => { onPref("qaIntroSeen", true); setIntroOpen(false); }}>{t("pages.qa.intro.done")}</Button>
        </DialogContent>
      </Dialog>
      {handle && (
        <QaShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          target={shareTarget}
          handle={handle}
          space={space}
          displayName={displayName}
          avatarUrl={avatarUrl}
        />
      )}
    </StudioToggleCard>
    </>
  );
}
