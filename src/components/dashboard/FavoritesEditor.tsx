import { useState } from "react";
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useServerFn } from "@tanstack/react-start";
import { fetchLinkPreview } from "@/lib/link-preview.functions";
import {
  FAVORITE_KINDS,
  FAVORITE_KIND_EMOJI,
  FAVORITE_KIND_LABEL,
  MAX_FAVORITES,
  newFavoriteId,
  type FavoriteKind,
  type ProfileFavorite,
} from "@/lib/favorites";
import { i18n as trI18n } from "@/lib/i18n";

interface Props {
  value: ProfileFavorite[];
  onChange: (next: ProfileFavorite[]) => void;
}

/**
 * Beheer van favoriete films, series en boeken. "Ophalen" leest de titel en
 * og:image van de gedeelde site; het veld met de afbeeldingslink blijft
 * bewerkbaar zodat een lid altijd een eigen afbeelding kan instellen.
 */
export function FavoritesEditor({ value, onChange }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const preview = useServerFn(fetchLinkPreview);

  const patch = (id: string, changes: Partial<ProfileFavorite>) =>
    onChange(value.map((f) => (f.id === id ? { ...f, ...changes } : f)));

  const add = () => {
    if (value.length >= MAX_FAVORITES) return;
    onChange([
      ...value,
      { id: newFavoriteId(), kind: "film", title: "", url: null, imageUrl: null, note: null },
    ]);
  };

  const autofill = async (fav: ProfileFavorite) => {
    if (!fav.url) {
      toast.error(trI18n.t("ui.0a021ecbd8"));
      return;
    }
    setBusyId(fav.id);
    try {
      const res = await preview({ data: { url: fav.url } });
      if (!res.ok) {
        toast.error(trI18n.t("ui.7de7dcf8e9"));
        return;
      }
      patch(fav.id, {
        title: fav.title || (res.title ?? ""),
        imageUrl: res.imageUrl ?? fav.imageUrl,
      });
      toast.success(res.imageUrl ? "Afbeelding opgehaald." : "Titel opgehaald.");
    } catch (err) {
      console.error("[favorieten] preview mislukt", err);
      toast.error(trI18n.t("ui.62a60e0d3e"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Deel je favoriete film, serie of boek. De afbeelding van de site wordt automatisch
          opgehaald — je kunt ook zelf een afbeeldingslink instellen.
        </p>
      )}

      {value.map((fav) => (
        <div key={fav.id} className="space-y-2 rounded-xl border border-border p-3">
          <div className="flex items-center gap-2">
            <Select
              value={fav.kind}
              onValueChange={(v) => patch(fav.id, { kind: v as FavoriteKind })}
            >
              <SelectTrigger className="h-9 w-36 text-xs" aria-label="Soort favoriet">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FAVORITE_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {FAVORITE_KIND_EMOJI[k]} {FAVORITE_KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={fav.title}
              maxLength={80}
              placeholder="Titel"
              aria-label="Titel"
              onChange={(e) => patch(fav.id, { title: e.target.value })}
              className="h-9 flex-1 text-xs"
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${fav.title || "Favoriet"} verwijderen`}
              onClick={() => onChange(value.filter((f) => f.id !== fav.id))}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={fav.url ?? ""}
              placeholder="https://… (IMDb, Goodreads, Spotify)"
              aria-label="Link naar de pagina"
              spellCheck={false}
              onChange={(e) => patch(fav.id, { url: e.target.value || null })}
              className="h-9 flex-1 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 gap-1.5"
              disabled={busyId === fav.id}
              onClick={() => void autofill(fav)}
            >
              {busyId === fav.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Wand2 className="h-3.5 w-3.5" aria-hidden />
              )}
              Ophalen
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40">
              {fav.imageUrl ? (
                <img src={fav.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <Input
              value={fav.imageUrl ?? ""}
              placeholder="Eigen afbeeldingslink (https://…)"
              aria-label="Afbeeldingslink"
              spellCheck={false}
              onChange={(e) => patch(fav.id, { imageUrl: e.target.value || null })}
              className="h-9 flex-1 text-xs"
            />
          </div>

          <Input
            value={fav.note ?? ""}
            maxLength={120}
            placeholder="Korte notitie (optioneel)"
            aria-label="Notitie"
            onChange={(e) => patch(fav.id, { note: e.target.value || null })}
            className="h-9 text-xs"
          />
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={value.length >= MAX_FAVORITES}
        onClick={add}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden /> Favoriet toevoegen ({value.length}/
        {MAX_FAVORITES})
      </Button>
    </div>
  );
}
