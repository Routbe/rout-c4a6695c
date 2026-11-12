import { useTranslation } from "react-i18next";
import {
  FAVORITE_BADGE_STYLE,
  FAVORITE_KIND_EMOJI,
  FAVORITE_KIND_LABEL,
  type FavoriteLayout,
  type ProfileFavorite,
} from "@/lib/favorites";
import { cn } from "@/lib/utils";

interface Props {
  favorites: ProfileFavorite[];
  theme: { bg: string; text: string; muted: string; border: string };
  /** Indeling: raster, carrousel of hero-kaart. */
  layout?: FavoriteLayout;
}

/** Publieke strook met de favoriete films, series en boeken van een lid. */
export function FavoritesShowcase({ favorites, theme: t, layout = "grid" }: Props) {
  const { t: tx } = useTranslation();
  if (favorites.length === 0) return null;

  const listClass =
    layout === "carousel"
      ? "flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1"
      : layout === "hero"
        ? "grid grid-cols-1 gap-2 sm:grid-cols-2"
        : "grid grid-cols-2 gap-2 sm:grid-cols-3";

  return (
    <section className="mt-6 w-full" aria-label={tx("profile.favoritesLabel")}>
      <h2
        className="mb-2 text-center text-[10px] font-semibold uppercase tracking-widest"
        style={{ color: t.muted }}
      >
         {tx("profile.favoritesLabel")} </h2>
      <ul className={listClass}>
        {favorites.map((fav, index) => {
          const hero = layout === "hero" && index === 0;
          const badgeStyle = FAVORITE_BADGE_STYLE[fav.badgeColor ?? "gold"];
          const inner = (
            <>
              <div
                className={cn(
                  "relative w-full overflow-hidden",
                  hero ? "aspect-[16/9]" : "aspect-[2/3]",
                )}
                style={{ background: t.border }}
              >
                {fav.imageUrl ? (
                  <img
                    src={fav.imageUrl}
                    alt={fav.title}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-2xl"
                    aria-hidden
                  >
                    {FAVORITE_KIND_EMOJI[fav.kind]}
                  </div>
                )}
                {fav.badge && (
                  <span
                    className="absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: badgeStyle.bg, color: badgeStyle.fg }}
                  >
                    {fav.badge}
                  </span>
                )}
              </div>
              <div className="p-2">
                <p className="truncate text-xs font-medium" style={{ color: t.text }}>
                  {fav.title}
                </p>
                <p className="truncate text-[10px]" style={{ color: t.muted }}>
                  {FAVORITE_KIND_EMOJI[fav.kind]} {FAVORITE_KIND_LABEL[fav.kind]}
                  {fav.note ? ` · ${fav.note}` : ""}
                </p>
              </div>
            </>
          );

          const frameClass = cn(
            "overflow-hidden",
            fav.glow && "animate-pulse shadow-[0_0_0_1px_currentColor,0_0_18px_-4px_currentColor]",
          );

          return (
            <li
              key={fav.id}
              className={cn(
                layout === "carousel" && "w-32 shrink-0 snap-start",
                hero && "sm:col-span-2",
              )}
            >
              {fav.url ? (
                <a
                  href={fav.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn("block transition-opacity hover:opacity-80", frameClass)}
                  style={{ border: `1px solid ${t.border}`, color: badgeStyle.bg }}
                >
                  {inner}
                </a>
              ) : (
                <div
                  className={frameClass}
                  style={{ border: `1px solid ${t.border}`, color: badgeStyle.bg }}
                >
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
