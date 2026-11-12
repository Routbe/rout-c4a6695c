import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { ExternalLink } from "lucide-react";
import type { ShowcaseCard } from "@/lib/showcase.functions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ShowcaseAvatar, ShowcaseMark, ShowcaseName } from "@/components/profile/ShowcaseIdentity";
import { profilePreviewPath } from "@/lib/profile-preview";

/** Bento layout: first card large, then a repeating wide/square rhythm. */
const SPAN = ["sm:col-span-2 sm:row-span-2", "", "", "sm:col-span-2", "", "sm:row-span-2", "", "sm:col-span-2"];

export function ExploreGallery({ cards, filters = false }: { cards: ShowcaseCard[]; filters?: boolean }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [onlyVerified, setOnlyVerified] = useState(false);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter(
      (c) =>
        (!onlyVerified || c.verified) &&
        (!q || c.handle.toLowerCase().includes(q) || (c.displayName ?? "").toLowerCase().includes(q)),
    );
  }, [cards, query, onlyVerified]);

  if (!cards.length) {
    return (
      <div className="rounded-3xl border border-dashed border-border p-12 text-center text-muted-foreground">
        <p>{t("explore.empty")}</p>
        <Link to="/tour" className="mt-4 inline-flex font-medium text-foreground underline underline-offset-4">
          {t("explore.cta")}
        </Link>
      </div>
    );
  }

  return (
    <>
      {filters && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("explore.search")}
              aria-label={t("explore.search")}
              className="min-h-11 w-full rounded-2xl border border-border bg-card pl-11 pr-4 text-sm text-foreground outline-none transition-colors focus:border-foreground/50"
            />
          </label>
          <div className="flex gap-2" role="group">
            {([false, true] as const).map((v) => (
              <Button
                variant="ghost"
                key={String(v)}
                type="button"
                aria-pressed={onlyVerified === v}
                onClick={() => setOnlyVerified(v)}
                className={cn(
                  "min-h-10 rounded-full border px-4 text-sm font-medium transition-colors",
                  onlyVerified === v ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t(v ? "explore.filter.verified" : "explore.filter.all")}
              </Button>
            ))}
          </div>
        </div>
      )}
      {shown.length === 0 && <p className="py-12 text-center text-muted-foreground">{t("explore.noResults")}</p>}
      <div className="grid grid-cols-1 gap-4 sm:auto-rows-fr sm:grid-cols-4">
        {shown.map((c, i) => {
          const big = i === 0;
          return (
            <Link
              key={c.handle}
              to="/$username"
              params={{ username: c.handle }}
              preload="intent"
              className={cn(
                "group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-3xl border border-border bg-card p-3 transition-all duration-300 motion-safe:hover:-translate-y-1 [@media(hover:hover)]:hover:border-foreground/30 [@media(hover:hover)]:hover:shadow-xl",
                SPAN[i % SPAN.length],
              )}
            >
              <div className="relative aspect-[1200/630] w-full overflow-hidden rounded-2xl border border-border/60 bg-muted">
                <img
                  src={profilePreviewPath(c.handle)}
                  alt={t("explore.preview", { name: c.displayName ?? c.handle })}
                  loading="lazy"
                  width={1200}
                  height={630}
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                  onError={(event) => {
                    const image = event.currentTarget;
                    if (!image.dataset.fallback) {
                      image.dataset.fallback = "svg";
                      image.src = profilePreviewPath(c.handle, "root", "svg");
                    } else {
                      image.style.display = "none";
                    }
                  }}
                />
              </div>
              <div className="mt-auto space-y-2 px-1 pb-1">
              <div className="flex items-center gap-3">
                <ShowcaseAvatar card={c} className={big ? "size-11 text-lg" : "size-9 text-base"} />
                <div className="min-w-0">
                   <p className="flex items-center gap-1.5 font-serif text-base font-semibold text-foreground">
                     <ShowcaseName card={c} />
                     <ShowcaseMark card={c} />
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">rout.be/{c.handle}</p>
                </div>
              </div>
              {(c.tagline || c.bio) && (
                 <p className={cn("text-sm leading-relaxed text-muted-foreground", big ? "line-clamp-2" : "line-clamp-1")}>
                  {c.tagline || c.bio}
                </p>
              )}
              <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground opacity-70">
                {t("explore.view")} <ExternalLink className="h-3 w-3" aria-hidden />
              </span>
              </div>
            </Link>
          );
        })}
      </div>

    </>
  );
}
