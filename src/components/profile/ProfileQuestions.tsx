import { MessageCircleQuestion } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { promptHeadline } from "@/lib/qa/prompts";
import { QaAskForm, type QaTheme } from "@/components/qa/QaAskForm";
import { qaPaths, useQaPublic, type QaSpace } from "@/components/qa/useQaPublic";
import { qaDesign } from "@/lib/qa/design";
import type { ProfileDisplayPrefs } from "@/lib/profile-display";

/** Hub block: NGL-style anonymous message card plus the answered Q&As. */
export function ProfileQuestions({ handle, space, theme, prefs, preview = false }: { handle: string; space: QaSpace; theme: QaTheme; prefs?: ProfileDisplayPrefs; preview?: boolean }) {
  const { t } = useI18n();
  const q = useQaPublic(handle, space);
  const qa = q.data;
  if (!preview && (!qa || !qa.accepting || !qa.onHub)) return null;
  const headline = promptHeadline(preview ? prefs?.qaPrompt : qa?.promptKey, preview ? prefs?.qaPromptCustom : qa?.promptCustom, t);
  const answers = preview ? [] : qa?.answers.slice(0, 5) ?? [];

  return (
    <section id="qna" className="mt-4 w-full max-w-sm scroll-mt-6 text-left" aria-label={headline}>
      <QaAskForm handle={handle} space={space} headline={headline} theme={theme} size="hub" designStyle={qaDesign(prefs, "questions", theme)} preview={preview} />
      {answers.length > 0 && (
        <ul className="mt-3 space-y-2" style={{ color: theme.text }}>
          {answers.map((it) => (
            <li key={it.id} className="rounded-xl p-2.5 text-sm" style={{ border: `1px solid ${theme.border}`, background: theme.card, ...qaDesign(prefs, "answers", theme) }}>
              <p className="break-words font-medium">{it.body}</p>
              <p className="mt-1.5 whitespace-pre-line break-words" style={{ color: theme.muted }}>↳ {it.answer}</p>
            </li>
          ))}
        </ul>
      )}
      {qa?.page && !preview && (
        <a href={qaPaths(handle, space).ask} className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs underline underline-offset-4" style={{ color: theme.muted }}>
          <MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden /> {t("pages.qa.ask.answersTitle")} · {qa.answers.length}
        </a>
      )}
    </section>
  );
}
