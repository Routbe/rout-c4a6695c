import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Users } from "lucide-react";
import { getPublicCustomBadges } from "@/lib/custom-badges.functions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BadgeEmblem } from "./BadgeEmblem";

type Item = Awaited<ReturnType<typeof getPublicCustomBadges>>[number];

const KIND_LABEL: Record<Item["kind"], string> = {
  crest: "badges.crest",
  emblem: "badges.emblem",
  award: "badges.award",
  partner: "badges.partner",
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/** Digitaal paspoort: badges as stamps; a click opens the stamp with date, emblem and reason. */
export function ProfilePassport({ handle, theme, compact = false }: { handle: string | null | undefined; theme: { card: string; border: string; text: string; muted: string }; compact?: boolean }) {
  const { t } = useTranslation();
  const load = useServerFn(getPublicCustomBadges);
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState<Item | null>(null);
  useEffect(() => {
    setItems([]);
    setOpen(null);
    if (!handle) return;
    let alive = true;
    void load({ data: { handle } })
      .then((r) => alive && setItems(r))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [handle, load]);
  const displayed = items.filter(item => compact ? item.showOnName : item.showInBadges);
  if (displayed.length === 0) return null;
  const since = formatDate(open?.grantedAt ?? null);
  return (
    <>
      <section aria-label={t("profile.passport")} className={compact ? "inline-flex shrink-0" : `mt-6 w-full border-y py-5 ${theme.border}`}>
        {!compact && <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={`font-display text-sm ${theme.text}`}> {t("profile.passport")} </h2>
          <span className={`text-xs ${theme.muted}`}>{items.length} {items.length === 1 ? t("profile.stamp") : t("profile.stamps")}</span>
        </header>}
        <ul className={compact ? "flex flex-wrap items-center gap-1" : "grid grid-cols-3 gap-3 sm:grid-cols-4"}>
          {displayed.map((b, i) => (
            <li key={b.slug}>
              <Button variant="ghost"
                type="button"
                onClick={() => setOpen(b)}
                aria-label={t("profile.viewStamp", { name: b.name })}
                style={{ borderColor: b.accentColor ?? undefined, rotate: `${((i * 37) % 13) - 6}deg` }}
                className={compact ? "size-7 shrink-0 rounded-full p-0 [&_svg]:size-5" : "flex aspect-square h-auto w-full whitespace-normal flex-col items-center justify-center gap-1 rounded-full border-2 border-dashed border-primary/60 p-2 motion-safe:transition-transform motion-safe:hover:scale-105 [&_svg]:size-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"}
              >
                <BadgeEmblem badge={b} size={compact ? 20 : 40} />
                {!compact && <span className={`line-clamp-2 max-w-full break-words text-[10px] font-medium leading-tight ${theme.text}`}>{b.name}</span>}
                {!compact && b.grantedAt && <span className={`text-[9px] ${theme.muted}`}>{new Date(b.grantedAt).toLocaleDateString("nl-BE", { month: "short", year: "numeric" })}</span>}
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-sm text-center">
          {open && (
            <>
              <div
                className="mx-auto -mt-2 grid h-32 w-32 place-items-center rounded-full"
                style={{ background: `radial-gradient(circle, ${open.accentColor ?? "var(--primary)"}33 0%, transparent 70%)` }}
              >
                <div className="motion-safe:animate-in motion-safe:zoom-in-50 duration-300">
                  <BadgeEmblem badge={open} size={104} />
                </div>
              </div>
              <DialogHeader className="items-center space-y-1 sm:text-center">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{t(KIND_LABEL[open.kind])}</p>
                <DialogTitle className="font-display text-2xl">{open.name}</DialogTitle>
                {open.motto && <p className="font-serif text-sm italic">“{open.motto}”</p>}
                <DialogDescription>{open.description ?? `Toegekend door ROUT aan @${handle}.`}</DialogDescription>
              </DialogHeader>
              {open.story && <p className="whitespace-pre-line text-left text-sm leading-relaxed">{open.story}</p>}
              {open.reason && (
                <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                  <span className="text-muted-foreground"> {t("profile.forHandle")} {handle}: </span>
                  {open.reason}
                </p>
              )}
              <dl className="grid grid-cols-2 gap-2 text-left text-xs">
                {since && (
                  <div className="rounded-lg border border-border p-2">
                    <dt className="text-muted-foreground"> {t("profile.granted")} </dt>
                    <dd className="font-medium">{since}</dd>
                  </div>
                )}
                <div className="rounded-lg border border-border p-2">
                  <dt className="text-muted-foreground"> {t("profile.holders")} </dt>
                  <dd className="flex items-center gap-1 font-medium">
                    <Users className="h-3 w-3" aria-hidden /> {open.holders}
                  </dd>
                </div>
              </dl>
              {open.issuerName && (
                <p className="text-xs text-muted-foreground">
                   {t("profile.issuedBy")} {" "}
                  {open.issuerUrl ? (
                    <a href={open.issuerUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-0.5 underline">
                      {open.issuerName} <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  ) : (
                    open.issuerName
                  )}
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProfileNameBadges(props: Parameters<typeof ProfilePassport>[0]) {
  return <ProfilePassport {...props} compact />;
}
