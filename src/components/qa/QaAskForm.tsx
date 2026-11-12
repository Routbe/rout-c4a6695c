import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Dices, Loader2, Lock, ShieldAlert, Sparkles, Undo2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { askAnonymousQuestion, getQuestionAccess } from "@/lib/questions.functions";
import { QUESTION_MAX } from "@/lib/questions-rules";
import { needsNudge } from "@/lib/qa/nudge";
import { needsCrisisHelp } from "@/lib/qa/crisis";
import { takeProof } from "@/lib/altcha-client";
import { Altcha } from "@/components/Altcha";
import { QaCrisisHelp } from "./QaCrisisHelp";
import { nextDiceIndex } from "@/lib/qa/prompts";
import { requestRewrite } from "@/lib/qa/rewrite-client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { QaSpace } from "./useQaPublic";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import type { CSSProperties as Style } from "react";

/** Profile-theme colors when embedded on a hub; tokens otherwise. */
export type QaTheme = { card: string; border: string; text: string; muted: string };

type Phase = "idle" | "rewriting" | "sending" | "sent";

const ERRORS: Record<string, string> = {
  invalid: "pages.qa.ask.invalid",
  not_found: "pages.qa.ask.closed",
  restricted: "pages.qa.ask.restricted",
  too_many: "pages.qa.ask.tooMany",
  bot: "pages.qa.ask.bot",
  unavailable: "pages.qa.ask.failed",
};

const WAND_ERRORS: Record<string, string> = {
  too_many: "pages.qa.ask.wandTooMany",
  invalid: "pages.qa.ask.invalid",
  failed: "pages.qa.ask.wandFailed",
};

/**
 * Anonymous send form. Muted or banned senders see exactly the same success
 * state as everyone else — the server answers "ok" either way. The magic wand
 * rewrites the draft in place; the sender always reviews and sends it.
 */
export function QaAskForm({ handle, space, headline, theme, size = "page", designStyle, preview = false }: {
  handle: string;
  space: QaSpace;
  headline: string;
  theme?: QaTheme;
  size?: "page" | "hub";
  designStyle?: Style;
  preview?: boolean;
}) {
  const { t, locale } = useI18n();
  const ask = useServerFn(askAnonymousQuestion);
  const access = useQuery({
    queryKey: ["qa-access", space, handle.toLowerCase()],
    queryFn: () => getQuestionAccess({ data: { handle, space } }),
    staleTime: 60_000,
    enabled: !preview,
  });
  const [body, setBody] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dice, setDice] = useState<number | null>(null);
  /** Client-only: the draft before the wand, for undo. Never sent anywhere. */
  const [original, setOriginal] = useState<string | null>(null);
  const [rewrite, setRewrite] = useState<{ text: string; via: "sovereign" | "local" } | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const pointerRef = useRef<string>("mouse");
  const tipTimer = useRef<number | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const wandHintId = useId();
  const nudgeId = useId();
  const nudge = needsNudge(body);
  const crisis = needsCrisisHelp(body);
  const locked = access.data ? !access.data.canSend : false;
  const big = size === "page";
  const masked = rewrite !== null && body.trim() === rewrite.text.trim();

  useEffect(() => {
    if (phase !== "sent") return;
    const timer = window.setTimeout(() => setPhase("idle"), 3200);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => () => { if (tipTimer.current) window.clearTimeout(tipTimer.current); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview || !body.trim() || phase === "sending" || phase === "rewriting") return;
    setError(null);
    setPhase("sending");
    try {
      const altcha = await takeProof().catch(() => null);
      const { result } = await ask({ data: { handle, space, body, ghost: masked, altcha } });
      if (result === "ok") {
        setBody("");
        setOriginal(null);
        setRewrite(null);
        setPhase("sent");
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([10]);
      } else {
        setPhase("idle");
        setError(t(result === "restricted" && access.data?.level === "members_only" ? "pages.qa.ask.membersOnly" : ERRORS[result] ?? "pages.qa.ask.failed"));
      }
    } catch {
      setPhase("idle");
      setError(t("pages.qa.ask.failed"));
    }
  };

  const showTipBriefly = () => {
    if (tipTimer.current) window.clearTimeout(tipTimer.current);
    window.setTimeout(() => setTipOpen(true), 0);
    tipTimer.current = window.setTimeout(() => setTipOpen(false), 2200);
  };

  const runWand = async () => {
    if (pointerRef.current !== "mouse") showTipBriefly();
    const draft = body.trim();
    if (preview || !draft || phase === "rewriting" || phase === "sending") {
      if (!draft) setError(t("pages.qa.ask.wandEmpty"));
      return;
    }
    setError(null);
    setPhase("rewriting");
    const before = body;
    const out = await requestRewrite(draft, locale);
    setPhase("idle");
    if (!out.ok) {
      setError(t(WAND_ERRORS[out.reason] ?? "pages.qa.ask.wandFailed"));
      return;
    }
    setOriginal((prev) => prev ?? before);
    setRewrite({ text: out.text, via: out.via });
    setBody(out.text.slice(0, QUESTION_MAX));
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([6, 40, 6]);
    window.requestAnimationFrame(() => {
      const el = textRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const undo = () => {
    if (original === null) return;
    setBody(original);
    setOriginal(null);
    setRewrite(null);
    setError(null);
    setTipOpen(false);
    setPhase("idle");
    textRef.current?.focus();
  };

  const rollDice = () => {
    const i = nextDiceIndex(dice);
    setDice(i);
    setBody(t(`pages.qa.dice.${i + 1}`));
    setOriginal(null);
    setRewrite(null);
  };

  const card: CSSProperties | undefined = theme ? { background: theme.card, border: `1px solid ${theme.border}`, color: theme.text } : undefined;
  const muted: CSSProperties | undefined = theme ? { color: theme.muted } : undefined;
  const line: CSSProperties | undefined = theme ? { border: `1px solid ${theme.border}` } : undefined;

  if (locked) {
    return (
      <div role="status" className={cn("rounded-3xl p-5 text-sm", !theme && "border border-border bg-card text-muted-foreground")} style={card}>
        <p style={muted}>{access.data?.level === "disabled" ? t("pages.qa.ask.closed") : t(access.data?.level === "members_only" ? "pages.qa.ask.membersOnly" : "pages.qa.ask.restricted")}</p>
      </div>
    );
  }

  const rewriting = phase === "rewriting";
  const busy = phase === "sending" || rewriting;
  return (
    <form onSubmit={submit} className="w-full" aria-label={headline} aria-busy={busy}>
      <div className={cn("overflow-hidden shadow-xl", big ? "rounded-[28px]" : "rounded-2xl", !theme && "bg-story-card text-story-ink")} style={{ ...card, ...designStyle }}>
        <div className={cn("bg-gradient-to-br from-story-ring to-story-ring-2 text-story-card", big ? "px-6 pb-5 pt-6" : "px-4 pb-3 pt-4")}>
          <p className={cn("font-display leading-tight", big ? "text-3xl" : "text-xl")}>{headline}</p>
        </div>
        <div className={cn("relative", big ? "p-5" : "p-3")}>
          <label className="sr-only" htmlFor={`${nudgeId}-msg`}>{headline}</label>
          <div className="relative">
            <textarea
              ref={textRef}
              id={`${nudgeId}-msg`}
              value={body}
              onChange={(e) => { setBody(e.target.value.slice(0, QUESTION_MAX)); setError(null); }}
              maxLength={QUESTION_MAX}
              rows={big ? 4 : 3}
              placeholder={t("pages.qa.ask.placeholder")}
              aria-describedby={[nudge ? nudgeId : null, wandHintId].filter(Boolean).join(" ")}
              className={cn(
                "w-full resize-none bg-transparent pb-12 pr-1 outline-none transition-opacity placeholder:opacity-50",
                big ? "text-lg" : "pb-11 text-sm",
                rewriting && "opacity-40",
              )}
              disabled={busy}
            />
            {rewriting && (
              <div aria-hidden className="qa-shimmer pointer-events-none absolute inset-0 rounded-xl" />
            )}
            <Tooltip open={tipOpen} onOpenChange={setTipOpen} delayDuration={250}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onPointerDown={(e) => { pointerRef.current = e.pointerType; }}
                  onClick={runWand}
                  disabled={busy}
                  aria-label={t("pages.qa.ask.wandTip")}
                  className={cn(
                    "absolute bottom-1 right-0 inline-flex items-center justify-center rounded-full bg-gradient-to-br from-story-ring to-story-ring-2 text-story-card shadow-lg ring-1 ring-story-card/30 transition-transform duration-200 hover:scale-105 active:scale-95 disabled:cursor-wait",
                    big ? "h-11 w-11" : "h-10 w-10",
                    rewriting && "qa-wand-busy",
                  )}
                >
                  {rewriting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Sparkles className="h-5 w-5" aria-hidden />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="end" className="max-w-56 text-center">
                {t("pages.qa.ask.wandTip")}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-xs opacity-70">
            <button type="button" onClick={rollDice} disabled={busy} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 font-medium transition-transform active:scale-95" style={line} aria-label={t("pages.qa.ask.dice")}>
              <Dices className="h-4 w-4" aria-hidden /> {big && t("pages.qa.ask.dice")}
            </button>
            <span aria-live="polite">{body.length}/{QUESTION_MAX}</span>
          </div>
        </div>
      </div>

      <div id={wandHintId} role="status" aria-live="polite" className="contents">
        {rewriting ? (
          <p className={cn("mt-3 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm", !theme && "border border-border bg-card/60")} style={line}>
            <Sparkles className="h-4 w-4 shrink-0 animate-pulse opacity-70" aria-hidden /> {t("pages.qa.ask.wandWorking")}
          </p>
        ) : rewrite ? (
          <div className={cn("mt-3 flex items-start gap-3 rounded-2xl px-4 py-3", !theme && "border border-border bg-card/60")} style={line}>
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 opacity-70" aria-hidden />
            <p className="min-w-0 flex-1 text-sm">
              {rewrite.via === "sovereign" ? t("pages.qa.ask.wandDone") : t("pages.qa.ask.wandBasic")}
            </p>
            {original !== null && (
              <button type="button" onClick={undo} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium underline-offset-4 hover:underline" style={line}>
                <Undo2 className="h-3.5 w-3.5" aria-hidden /> {t("pages.qa.ask.wandUndo")}
              </button>
            )}
          </div>
        ) : (
          <p className={cn("mt-2 px-1 text-xs", !theme && "text-muted-foreground")} style={muted}>
            <Sparkles className="mr-1 inline h-3 w-3 align-[-2px]" aria-hidden />{t("pages.qa.ask.wandHint")}
          </p>
        )}
      </div>

      {nudge && (
        <p id={nudgeId} role="status" className="mt-3 flex items-start gap-2 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span>{t("pages.qa.ask.nudge")}</span>
        </p>
      )}
      {crisis && <QaCrisisHelp audience="sender" className="mt-3" />}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        disabled={preview || busy || (!body.trim() && phase !== "sent")}
        className={cn(
          "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full font-semibold transition-all duration-300 active:scale-[0.98] disabled:opacity-60",
          big ? "min-h-14 text-base" : "min-h-11 text-sm",
          phase === "sent" ? "bg-story-ring text-story-card" : "bg-foreground text-background",
        )}
        aria-live="polite"
        style={designStyle}
      >
        {phase === "sent" ? (
          <><Check className="qa-sent-pop h-5 w-5" aria-hidden /> {t("pages.qa.ask.sent")}</>
        ) : phase === "sending" ? (
          <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t("pages.qa.ask.sending")}</>
        ) : (
          t("pages.qa.ask.send")
        )}
      </Button>
      <p className={cn("mt-2 flex items-center justify-center gap-1.5 text-center text-xs", !theme && "text-muted-foreground")} style={muted}>
        <Lock className="h-3 w-3" aria-hidden /> {t("pages.qa.ask.anonymous")}
      </p>
      <p className={cn("mt-1 text-center text-[11px] leading-snug", !theme && "text-muted-foreground")} style={muted}>
        {t("pages.qa.ask.disclaimer")}
      </p>
      {!preview && <Altcha className="justify-center" />}
      {!preview && <nav aria-label={t("pages.qa.help.label")} className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs" style={muted}>
        <Link to="/info/anonymous-questions" className="underline underline-offset-4">{t("pages.qa.help.questions")}</Link>
        <Link to="/safety/anonymous-questions" className="underline underline-offset-4">{t("pages.qa.help.privacy")}</Link>
        <Link to="/info/ghost-mode" className="underline underline-offset-4">{t("pages.qa.help.ai")}</Link>
      </nav>}
    </form>
  );
}
