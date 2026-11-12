import { FeedbackPanel } from "@/components/studio/FeedbackPanel";
import { feedbackPath } from "@/lib/feedback";
import { useI18n } from "@/lib/i18n";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyFeedback } from "@/lib/feedback.functions";
import { useAuth } from "@/hooks/useAuth";
export function FeedbackQRInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const load = useServerFn(getMyFeedback);
  const mine = useQuery({ queryKey: ["feedback-qr-choice", user?.id], queryFn: () => load(), enabled: Boolean(user), retry: false });
  useEffect(() => {
    if (value) return;
    const id = new URLSearchParams(window.location.search).get("form");
    const form = mine.data?.forms.find(f => f.id === id);
    if (form) onChange(`${window.location.origin}${feedbackPath(form.slug)}`);
  }, [mine.data, value, onChange]);
  return <div className="space-y-3"><FeedbackPanel picker onPick={f => onChange(`${window.location.origin}${feedbackPath(f.slug)}`)} />{value && <p className="break-all text-xs text-muted-foreground">{t("feedback.selected")}: {value}</p>}</div>;
}