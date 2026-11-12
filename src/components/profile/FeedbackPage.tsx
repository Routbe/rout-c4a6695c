import { FeedbackCard } from "./FeedbackCard";
import { useI18n } from "@/lib/i18n";
import type { PublicFeedback } from "@/lib/feedback";

export function FeedbackPage({ items }: { items: PublicFeedback[] }) {
  const { t } = useI18n();
  return <main className="min-h-screen bg-background px-4 py-10 text-foreground"><div className="mx-auto max-w-xl space-y-6"><a href="/" className="font-display text-xl">ROUT</a><h1 className="text-2xl font-semibold">{t("feedback.title")}</h1>{items.length ? items.map(i => <FeedbackCard key={i.form.id} item={i} />) : <p>{t("feedback.unavailable")}</p>}</div></main>;
}