import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Copy, Mail, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminFindGiftRecipients, adminIssueGiftCard, adminResendGift } from "@/lib/admin-gift-cards.functions";
import { giftIssueSchema, type GiftIssueInput } from "@/lib/gift-issue-rules";
import { GIFT_UI_COPY } from "@/lib/gift-ui-copy";

type Recipient = Awaited<ReturnType<typeof adminFindGiftRecipients>>[number];
type Result = Awaited<ReturnType<typeof adminIssueGiftCard>>;

export function IssuePersonalGift() {
  const { i18n } = useTranslation();
  const language = i18n.language === "fr" || i18n.language === "de" || i18n.language === "nl" ? i18n.language : "en";
  const c = GIFT_UI_COPY[language];
  const issue = useServerFn(adminIssueGiftCard);
  const resend = useServerFn(adminResendGift);
  const find = useServerFn(adminFindGiftRecipients);
  const [kind, setKind] = useState<"fixed" | "percentage">("fixed");
  const [value, setValue] = useState("25");
  const [cap, setCap] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [expiry, setExpiry] = useState("");
  const [uses, setUses] = useState("1");
  const [sendEmail, setSendEmail] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Recipient[]>([]);
  const [picked, setPicked] = useState(false);
  const [recipientUserId, setRecipientUserId] = useState<string | null>(null);
  const [review, setReview] = useState<GiftIssueInput | null>(null);
  const [saved, setSaved] = useState<{ input: GiftIssueInput; result: Result } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setMatches([]);
    if (picked || query.replace(/^@/, "").trim().length < 2) return;
    const timer = setTimeout(() => {
      void find({ data: { query } }).then(r => { if (active) setMatches(r); }).catch(() => { if (active) toast.error(c.failed); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query, picked, find, c.failed]);

  const valueLabel = (input: GiftIssueInput) => input.kind === "fixed"
    ? new Intl.NumberFormat(language, { style: "currency", currency: "EUR" }).format((input.amountCents ?? 0) / 100)
    : `${input.percentOff}%`;
  const status = (result: Result) => result.delivery === "accepted" ? c.accepted : result.delivery === "failed" ? c.mailFailed : c.noMail;

  return <section className="space-y-4 border-b border-border pb-6">
    <h2 className="text-lg font-medium">{c.title}</h2>
    <div className="inline-flex gap-1 border-b border-border" role="tablist">
      {(["fixed", "percentage"] as const).map(k => <Button key={k} role="tab" aria-selected={kind === k} variant={kind === k ? "secondary" : "ghost"} onClick={() => setKind(k)}>{k === "fixed" ? c.fixed : c.percentage}</Button>)}
    </div>
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={e => {
      e.preventDefault();
      const amount = Number(value.replace(",", "."));
      const parsed = giftIssueSchema.safeParse({ kind, amountCents: kind === "fixed" ? Math.round(amount * 100) : undefined,
        percentOff: kind === "percentage" ? amount : undefined, maxDiscountCents: kind === "percentage" && cap ? Math.round(Number(cap.replace(",", ".")) * 100) : null,
        recipientEmail: email, recipientUserId, recipientName: name, message, expiresAt: expiry ? new Date(`${expiry}T23:59:59Z`).toISOString() : null,
        maxRedemptions: Number(uses), sendEmail, language });
      if (!parsed.success) { toast.error(c.failed); return; }
      setReview(parsed.data);
    }}>
      <div className="space-y-1"><Label htmlFor="gift-value">{kind === "fixed" ? c.amount : c.percent}</Label><Input id="gift-value" type="number" min={kind === "fixed" ? 5 : 1} max={kind === "fixed" ? 500 : 100} step={kind === "fixed" ? ".01" : "1"} value={value} onChange={e => setValue(e.target.value)} required /></div>
      {kind === "percentage" && <div className="space-y-1"><Label htmlFor="gift-cap">{c.cap}</Label><Input id="gift-cap" type="number" min=".01" max="500" step=".01" value={cap} onChange={e => setCap(e.target.value)} /></div>}
      <div className="relative space-y-1 sm:col-span-2"><Label htmlFor="gift-search">{c.search}</Label><Input id="gift-search" value={query} onChange={e => { setQuery(e.target.value); setPicked(false); setRecipientUserId(null); setEmail(""); setName(""); }} autoComplete="off" />
        {matches.length > 0 && <ul className="absolute z-20 w-full border border-border bg-popover p-1 shadow-md">{matches.map(r => <li key={r.userId}><Button type="button" variant="ghost" className="h-auto w-full justify-start whitespace-normal text-left" onClick={() => { setQuery(`@${r.username}`); setPicked(true); setRecipientUserId(r.userId); setMatches([]); setEmail(""); setName(r.name); }}>@{r.username} · {r.name}</Button></li>)}</ul>}
      </div>
      <div className="space-y-1"><Label htmlFor="gift-email">{c.email}</Label><Input id="gift-email" type="email" value={email} placeholder={recipientUserId ? query : ""} onChange={e => setEmail(e.target.value)} maxLength={254} required={sendEmail && !recipientUserId} /></div>
      <div className="space-y-1"><Label htmlFor="gift-name">{c.name}</Label><Input id="gift-name" value={name} onChange={e => setName(e.target.value)} maxLength={80} /></div>
      <div className="space-y-1 sm:col-span-2"><Label htmlFor="gift-message">{c.message}</Label><Textarea id="gift-message" value={message} onChange={e => setMessage(e.target.value)} maxLength={300} /></div>
      <div className="space-y-1"><Label htmlFor="gift-expiry">{c.expiry}</Label><Input id="gift-expiry" type="date" value={expiry} onChange={e => setExpiry(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="gift-uses">{c.uses}</Label><Input id="gift-uses" type="number" min="1" max="10000" value={uses} onChange={e => setUses(e.target.value)} required /></div>
      <div className="flex items-center gap-2 sm:col-span-2"><Switch id="gift-send" checked={sendEmail} onCheckedChange={setSendEmail} /><Label htmlFor="gift-send">{c.send}</Label></div>
      <Button type="submit" className="w-fit" disabled={busy}><Plus className="h-4 w-4" />{c.preview}</Button>
    </form>
    <Dialog open={review !== null} onOpenChange={v => { if (!v && !busy) setReview(null); }}><DialogContent><DialogHeader><DialogTitle>{c.preview}</DialogTitle></DialogHeader>
      {review && <><dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm"><dt>{c.recipient}</dt><dd className="break-all">{review.recipientName} {review.recipientEmail || (review.recipientUserId ? query : c.noRecipient)}</dd><dt>{review.kind === "fixed" ? c.amount : c.percent}</dt><dd>{valueLabel(review)}</dd><dt>{c.uses}</dt><dd>{review.maxRedemptions}</dd><dt>{c.expiry}</dt><dd>{review.expiresAt ? new Date(review.expiresAt).toLocaleDateString(language) : c.unlimited}</dd>{review.maxDiscountCents && <><dt>{c.cap}</dt><dd>{review.maxDiscountCents / 100} €</dd></>}</dl>
      {review.message && <p className="whitespace-pre-wrap break-words text-sm">{review.message}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setReview(null)}>{c.cancel}</Button><Button disabled={busy} onClick={async () => {
        setBusy(true); try { const result = await issue({ data: review }); setSaved({ input: review, result }); setReview(null); toast.success(c.saved); } catch { toast.error(c.failed); } finally { setBusy(false); }
      }}>{c.confirm}</Button></div></>}
    </DialogContent></Dialog>
    {saved && <div className="space-y-2 border-t border-border pt-4" role="status"><div className="flex flex-wrap items-center gap-2"><span>{c.code}:</span><code className="break-all text-sm">{saved.result.code}</code><Button variant="ghost" size="icon" aria-label={c.copy} onClick={() => void navigator.clipboard.writeText(saved.result.code)}><Copy className="h-4 w-4" /></Button></div><p className={saved.result.delivery === "failed" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{status(saved.result)}</p>
      {(saved.input.recipientEmail || saved.input.recipientUserId) && <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { const result = await resend({ data: { code: saved.result.code, input: saved.input } }); setSaved({ ...saved, result: { code: saved.result.code, ...result } }); } catch { toast.error(c.failed); } finally { setBusy(false); } }}><Mail className="h-4 w-4" />{c.resend}</Button>}
    </div>}
  </section>;
}