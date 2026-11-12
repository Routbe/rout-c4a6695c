import { useTranslation } from "react-i18next";
import { StudioSectionIcon } from "./StudioSectionIcon";
import { useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FavoritesEditor } from "@/components/dashboard/FavoritesEditor";
import { cn } from "@/lib/utils";
import {
  FAVORITE_BADGE_COLORS,
  FAVORITE_BADGE_LABEL,
  FAVORITE_BADGE_PRESETS,
  FAVORITE_BADGE_STYLE,
  FAVORITE_KIND_EMOJI,
  FAVORITE_LAYOUTS,
  FAVORITE_LAYOUT_LABEL,
  MAX_FAVORITES,
  type FavoriteBadgeColor,
  type FavoriteLayout,
  type ProfileFavorite,
} from "@/lib/favorites";

interface Props {
  favorites: ProfileFavorite[];
  onFavoritesChange: (next: ProfileFavorite[]) => void;
  layout: FavoriteLayout;
  onLayoutChange: (next: FavoriteLayout) => void;
}

/**
 * ⭐ Favorieten & curatie.
 *
 * Naast de bestaande favorieteneditor kies je hier de indeling van de strook,
 * sleep je de volgorde en geef je elke kaart een badge-overlay en gloedrand.
 */
export function ProfileFavoritesAccordion({
  favorites,
  onFavoritesChange,
  layout,
  onLayoutChange,
}: Props) {
  const { t } = useTranslation();
  const dragId = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const patch = (id: string, changes: Partial<ProfileFavorite>) =>
    onFavoritesChange(favorites.map((f) => (f.id === id ? { ...f, ...changes } : f)));

  const dropOn = (targetId: string) => {
    const sourceId = dragId.current;
    dragId.current = null;
    setDragging(null);
    if (!sourceId || sourceId === targetId) return;
    const next = [...favorites];
    const from = next.findIndex((f) => f.id === sourceId);
    const to = next.findIndex((f) => f.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onFavoritesChange(next);
  };

  return (
    <AccordionItem
      value="favorites"
      className="rounded-2xl border border-border bg-card px-4 sm:px-5"
    >
      <AccordionTrigger className="hover:no-underline">
        <span className="flex flex-1 items-center justify-between gap-3 pr-2">
          <span className="flex min-w-0 items-center gap-2 text-base font-medium"><StudioSectionIcon kind="favorites" />{t("studio.favorites.title").replace(/^\p{Extended_Pictographic}\s*/u, "")}</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {favorites.length}/{MAX_FAVORITES}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-5 pb-5">
        <section className="space-y-2">
          <p className="text-xs font-medium">{t("studio.favorites.layout")}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {FAVORITE_LAYOUTS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={layout === id}
                onClick={() => onLayoutChange(id)}
                className={cn(
                  "rounded-xl border p-2 text-xs transition-colors",
                  layout === id
                    ? "border-foreground bg-muted font-medium"
                    : "border-border hover:bg-muted",
                )}
              >
                {FAVORITE_LAYOUT_LABEL[id]}
              </button>
            ))}
          </div>
        </section>

        {favorites.length > 1 && (
          <section className="space-y-2">
            <p className="text-xs font-medium">{t("studio.favorites.order")}</p>
            <ul className="space-y-1">
              {favorites.map((fav) => (
                <li
                  key={fav.id}
                  draggable
                  onDragStart={() => {
                    dragId.current = fav.id;
                    setDragging(fav.id);
                  }}
                  onDragEnd={() => setDragging(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => dropOn(fav.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-xs",
                    dragging === fav.id && "opacity-50",
                  )}
                >
                  <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">
                    {FAVORITE_KIND_EMOJI[fav.kind]} {fav.title || t("studio.common.untitled")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {favorites.length > 0 && (
          <section className="space-y-3">
            <p className="text-xs font-medium">{t("studio.favorites.badgeGlow")}</p>
            {favorites.map((fav) => (
              <div key={fav.id} className="space-y-2 rounded-xl border border-border p-3">
                <p className="truncate text-xs font-medium">
                  {FAVORITE_KIND_EMOJI[fav.kind]} {fav.title || t("studio.common.untitled")}
                </p>
                <Input
                  value={fav.badge ?? ""}
                  maxLength={24}
                  placeholder={t("studio.favorites.badgePlaceholder")}
                  aria-label={t("studio.favorites.badgeText")}
                  onChange={(e) => patch(fav.id, { badge: e.target.value || null })}
                  className="h-9 text-xs"
                />
                <div className="flex flex-wrap gap-1">
                  {FAVORITE_BADGE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => patch(fav.id, { badge: preset })}
                      className="rounded-full border border-border px-2 py-0.5 text-[10px] hover:bg-muted"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {FAVORITE_BADGE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={FAVORITE_BADGE_LABEL[color]}
                      aria-pressed={(fav.badgeColor ?? "gold") === color}
                      onClick={() => patch(fav.id, { badgeColor: color as FavoriteBadgeColor })}
                      className={cn(
                        "h-6 w-6 rounded-full border-2",
                        (fav.badgeColor ?? "gold") === color
                          ? "border-foreground"
                          : "border-transparent",
                      )}
                      style={{ background: FAVORITE_BADGE_STYLE[color].bg }}
                    />
                  ))}
                </div>
                <label className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{t("studio.favorites.glow")}</span>
                  <Switch
                    checked={Boolean(fav.glow)}
                    onCheckedChange={(v) => patch(fav.id, { glow: v })}
                    aria-label="Gloedrand"
                  />
                </label>
              </div>
            ))}
          </section>
        )}

        <FavoritesEditor value={favorites} onChange={onFavoritesChange} />
      </AccordionContent>
    </AccordionItem>
  );
}
