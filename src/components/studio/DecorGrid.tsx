import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Heart, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { filterDecor } from "@/lib/decor-filter";

export type DecorItem = { id: string; label: string; category: string; keywords?: string };

const PAGE = 36;

function readFavs(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Doorzoekbaar raster voor kaders/decoraties: zoekveld, vaste groepsknoppen,
 * populair + favorieten bovenaan, en per 36 tegelijk tonen zodat 100+ items
 * vlot blijven.
 */
export function DecorGrid({
  items,
  categories,
  popular,
  value,
  onChange,
  renderPreview,
  favKey,
  placeholder = "Zoek… (bv. kroon, neon, kat)",
}: {
  items: DecorItem[];
  categories: { id: string; label: string }[];
  popular: string[];
  value: string;
  onChange: (id: string) => void;
  renderPreview: (id: string) => ReactNode;
  favKey: string;
  placeholder?: string;
}) {
  const [filter, setFilter] = useState("popular");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [favs, setFavs] = useState<string[]>([]);
  useEffect(() => setFavs(readFavs(favKey)), [favKey]);
  useEffect(() => setLimit(PAGE), [filter, q]);

  const toggleFav = (id: string) => {
    setFavs((f) => {
      const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      try {
        localStorage.setItem(favKey, JSON.stringify(next));
      } catch {
        /* opslag vol of geblokkeerd */
      }
      return next;
    });
  };

  const list = useMemo(() => filterDecor(items, { filter, q, favs, popular }), [items, filter, q, favs, popular]);
  const searching = q.trim().length > 0;

  const tile = (d: DecorItem) => (
    <div key={d.id} className="relative [content-visibility:auto] [contain-intrinsic-size:96px]">
      <button
        type="button"
        onClick={() => onChange(d.id)}
        aria-pressed={value === d.id}
        title={d.label}
        className={cn(
          "flex w-full flex-col items-center gap-1.5 rounded-xl border px-2 pb-2 pt-5 transition-all hover:-translate-y-0.5",
          value === d.id ? "border-primary ring-1 ring-primary" : "border-border",
        )}
      >
        {renderPreview(d.id)}
        <span className="line-clamp-1 text-[10px] text-muted-foreground">{d.label}</span>
      </button>
      {d.id !== "none" && (
        <button
          type="button"
          onClick={() => toggleFav(d.id)}
          aria-label={favs.includes(d.id) ? `${d.label} uit favorieten` : `${d.label} als favoriet`}
          aria-pressed={favs.includes(d.id)}
          className="absolute right-1 top-1 rounded-full p-1 text-muted-foreground hover:text-foreground"
        >
          <Heart className={cn("h-3 w-3", favs.includes(d.id) && "fill-primary text-primary")} />
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-1 space-y-2 bg-background/95 px-1 pb-2 pt-1 backdrop-blur">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            aria-label="Zoeken"
            className="h-9 w-full rounded-full border border-border bg-background pl-8 pr-3 text-xs"
          />
        </label>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {[{ id: "popular", label: "★ Populair" }, ...categories.filter((c) => c.id !== "popular"), { id: "fav", label: `♥ Favorieten${favs.length ? ` (${favs.length})` : ""}` }].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              className={cn(
                "h-8 shrink-0 rounded-full border px-3 text-[11px] font-medium transition-colors",
                !searching && filter === c.id ? "border-primary/50 bg-primary/10" : "border-border",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {searching ? `${list.length} resultaten in alle ${items.length} stijlen` : filter === "popular" ? `Populair & favorieten · ${items.length} stijlen via “Alles”` : `${list.length} stijlen`}
      </p>
      {list.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">{searching ? <>Niets gevonden voor “{q}”.</> : filter === "fav" ? "Nog geen favorieten — tik op het hartje." : "Niets in deze groep."}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {list.slice(0, limit).map(tile)}
        </div>
      )}
      {list.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          className="h-9 w-full rounded-full border border-border text-xs font-medium"
        >
          Meer tonen ({list.length - limit})
        </button>
      )}
    </div>
  );
}
