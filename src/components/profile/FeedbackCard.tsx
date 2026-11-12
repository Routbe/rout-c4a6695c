import { useState } from "react";
import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, Check, Send, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useI18n } from "@/lib/i18n";
import { getPublicFeedback, sendFeedbackResponse } from "@/lib/feedback.functions";
import { feedbackPath, validFeedbackAnswer, type PublicFeedback } from "@/lib/feedback";

export function FeedbackCard({ item, style, preview = false }: { item: PublicFeedback; style?: CSSProperties; preview?: boolean }) {
  const { t } = useI18n();
  const send = useServerFn(sendFeedbackResponse);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [slide, setSlide] = useState(0);
  const { form, featured } = item;
  const max = form.type === "nps_10" ? 10 : form.type === "emoji_3" ? 3 : 5;
  const values = Array.from({ length: max + (form.type === "nps_10" ? 1 : 0) }, (_, i) => i + (form.type === "nps_10" ? 0 : 1));
  const review = featured[slide % Math.max(1, featured.length)];
  return <article className="w-full space-y-4 rounded-lg border border-border bg-card p-4 text-card-foreground" style={style}>
    <h3 className="break-words text-base font-semibold">{form.title}</h3>
    {done ? <p role="status" className="flex items-center gap-2 text-sm"><Check className="size-4" />{t("feedback.thanks")}</p> : <form className="space-y-3" onSubmit={async e => {
      e.preventDefault();
      if (preview || !validFeedbackAnswer(form.type, rating, comment)) return;
      setBusy(true); setError("");
      try {
        const result = await send({ data: { formId: form.id, rating, comment, reviewerName: name, allowFeatured: consent, company } });
        if (result.ok) setDone(true); else setError(t("feedback.failed"));
      } catch { setError(t("feedback.failed")); } finally { setBusy(false); }
    }}>
      {form.type !== "text_review" && <div role="group" aria-label={t("feedback.rating")} className="flex flex-wrap gap-1">
        {values.map(v => <Button key={v} type="button" size="icon" variant={rating === v ? "default" : "outline"} aria-label={`${v} / ${max}`} aria-pressed={rating === v} onClick={() => setRating(v)} className="size-9 shrink-0">
          {form.type === "stars_5" ? <Star className={`size-4 ${rating !== null && v <= rating ? "fill-current" : ""}`} /> : form.type === "emoji_3" ? ["🙁", "😐", "😊"][v - 1] : v}
        </Button>)}
      </div>}
      <label className="block space-y-1 text-sm"><span>{t("feedback.comment")}</span><textarea value={comment} required={form.type === "text_review"} onChange={e => setComment(e.target.value)} maxLength={2000} className="min-h-20 w-full resize-y rounded-lg border border-input bg-background p-3 text-foreground" /></label>
      <label className="block space-y-1 text-sm"><span>{t("feedback.name")}</span><Input value={name} onChange={e => setName(e.target.value)} maxLength={100} /></label>
      <label className="flex items-start gap-2 text-xs"><Checkbox checked={consent} onCheckedChange={v => setConsent(v === true)} /><span>{t("feedback.consent")}</span></label>
      <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={company} onChange={e => setCompany(e.target.value)} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy || preview || !validFeedbackAnswer(form.type, rating, comment)} className="gap-2"><Send className="size-4" />{t(busy ? "feedback.sending" : "feedback.send")}</Button>
      <p className="text-xs opacity-70">{t("feedback.private")}</p>
    </form>}
    {review && <div className="space-y-2 border-t border-border pt-3">
      <p className="text-xs font-medium">{t("feedback.testimonials")}</p>
      <blockquote className="break-words text-sm">{review.comment}</blockquote>
      <div className="flex items-center justify-between gap-2"><span className="text-xs">{review.reviewerName || t("feedback.anonymous")}{review.rating != null && ` · ${review.rating} / ${max}`}</span>
      {featured.length > 1 && <div className="flex gap-1"><Button size="icon" variant="ghost" aria-label={t("feedback.previous")} onClick={() => setSlide((slide + featured.length - 1) % featured.length)}><ArrowLeft className="size-4" /></Button><Button size="icon" variant="ghost" aria-label={t("feedback.next")} onClick={() => setSlide((slide + 1) % featured.length)}><ArrowRight className="size-4" /></Button></div>}</div>
    </div>}
  </article>;
}

export function ProfileFeedback({ handle, space, formId, style }: { handle: string; space: "root" | "alias" | "workspace"; formId?: string; style?: CSSProperties }) {
  const load = useServerFn(getPublicFeedback);
  const { t } = useI18n();
  const query = useQuery({ queryKey: ["public-feedback", space, handle], queryFn: () => load({ data: { space, handle } }), retry: false });
  return <>{(query.data ?? []).filter(i => !formId || i.form.id === formId).map(item => item.form.fullPage
    ? <Button key={item.form.id} asChild variant="outline"><a href={feedbackPath(item.form.slug)}>{item.form.title}<ArrowRight className="size-4" /></a></Button>
    : <FeedbackCard key={item.form.id} item={item} style={style} />)}{query.isError && <p className="text-xs text-muted-foreground">{t("feedback.failed")}</p>}</>;
}