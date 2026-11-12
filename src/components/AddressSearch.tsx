import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Hit {
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}

export interface PickedAddress {
  label: string;
  street: string;
  postcode: string;
  city: string;
  country: string;
  lat: string;
  lng: string;
}

interface Props {
  onPick: (hit: PickedAddress) => void;
}

const empty = { street: "", postcode: "", city: "", country: "" };

/** Splits a Nominatim address object into ROUT's structured fields. */
function split(hit: Hit): Omit<PickedAddress, "label" | "lat" | "lng"> {
  const a = hit.address ?? {};
  const house = a.house_number ?? "";
  const road = a.road ?? a.pedestrian ?? a.footway ?? a.hamlet ?? "";
  return {
    street: [road, house].filter(Boolean).join(" ").trim(),
    postcode: a.postcode ?? "",
    city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? "",
    country: a.country ?? "",
  };
}

/** Reads coordinates or a place query out of a Google Maps / goo.gl link. */
export function parseMapsLink(raw: string): { lat?: string; lng?: string; query?: string } | null {
  const value = raw.trim();
  if (
    !/^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(
      value,
    )
  )
    return null;
  const at = value.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) return { lat: at[1], lng: at[2] };
  const bang = value.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (bang) return { lat: bang[1], lng: bang[2] };
  try {
    const url = new URL(value);
    const q = url.searchParams.get("q") ?? url.searchParams.get("query");
    if (q) {
      const coords = q.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
      if (coords) return { lat: coords[1], lng: coords[2] };
      return { query: q };
    }
    const place = url.pathname.match(/\/place\/([^/]+)/);
    if (place) return { query: decodeURIComponent(place[1]).replace(/\+/g, " ") };
  } catch {
    /* not a parsable URL */
  }
  return {};
}

/**
 * Address lookup through OpenStreetMap Nominatim — no API key. Also accepts a
 * pasted Google Maps link and reads its coordinates or place name.
 * Manual entry always stays available.
 */
export function AddressSearch({ onPick }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = async (q: string): Promise<Hit[]> => {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) throw new Error("lookup failed");
    return (await res.json()) as Hit[];
  };

  const reverse = async (lat: string, lng: string): Promise<Hit | null> => {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    return (await res.json()) as Hit;
  };

  const run = async () => {
    const q = query.trim();
    if (q.length < 3) {
      setError("Type at least 3 characters, or paste a Google Maps link.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const maps = parseMapsLink(q);
      if (maps) {
        if (maps.lat && maps.lng) {
          const hit = await reverse(maps.lat, maps.lng).catch(() => null);
          onPick({
            label: hit?.display_name ?? `${maps.lat}, ${maps.lng}`,
            ...(hit ? split(hit) : empty),
            lat: maps.lat,
            lng: maps.lng,
          });
          setHits([]);
          setQuery("");
          setLoading(false);
          return;
        }
        if (maps.query) {
          const data = await lookup(maps.query);
          setHits(data.slice(0, 5));
          if (!data.length)
            setError("Could not resolve that Maps link — fill the fields manually.");
          setLoading(false);
          return;
        }
        setError("Short Maps links cannot be resolved — open it once and paste the full URL.");
        setLoading(false);
        return;
      }

      const data = await lookup(q);
      setHits(data.slice(0, 5));
      if (!data.length) setError("No match — enter the address manually below.");
    } catch {
      setError("Lookup unavailable — enter the address manually below.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-w-0 space-y-2">
      <label className="input-label" htmlFor="address-search">
        Search an address or paste a Maps link{" "}
        <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <div className="flex min-w-0 gap-2">
        <Input
          id="address-search"
          value={query}
          maxLength={400}
          placeholder="Grote Markt 1, Kortrijk"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
          className="input-field h-11 min-w-0 flex-1 rounded-xl border-border bg-background"
        />
        <Button
          type="button"
          variant="outline"
          className="h-11 shrink-0 rounded-xl"
          onClick={() => void run()}
          disabled={loading}
          aria-label="Search address"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {error && <p className="text-xs text-muted-foreground">{error}</p>}

      {hits.length > 0 && (
        <ul className="space-y-1">
          {hits.map((h) => (
            <li key={`${h.lat},${h.lon}`}>
              <button
                type="button"
                className="w-full rounded-lg px-2 py-2 text-left text-xs text-foreground hover:bg-muted"
                onClick={() => {
                  onPick({
                    label: h.display_name,
                    ...split(h),
                    lat: h.lat,
                    lng: h.lon,
                  });
                  setHits([]);
                }}
              >
                {h.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        Powered by OpenStreetMap · no API key · Google Maps links supported.
      </p>
    </div>
  );
}
