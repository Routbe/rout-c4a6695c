import { useTranslation } from "react-i18next";
import type { CSSProperties } from "react";
import { MapPin } from "lucide-react";

import { mapEmbedUrl, mapExternalUrl, type MapConfig } from "@/lib/interactions";

/** Publieke kaart-embed met directe routebeschrijving. */
export function MapCard({ config, style }: { config: MapConfig; style?: CSSProperties }) {
  const { t } = useTranslation();
  const address = config.address.trim();
  if (!address) return null;

  return (
    <div
      className="w-full overflow-hidden rounded-2xl border border-zinc-200/80 text-left shadow-sm"
      style={style}
    >
      <p className="flex items-center gap-2 border-b border-border/40 px-4 py-3 text-sm font-medium">
        <MapPin className="h-4 w-4 shrink-0" aria-hidden />
        {config.label || address}
      </p>
      <iframe
        src={mapEmbedUrl(address)}
        title={config.label || address}
        loading="lazy"
        className="block h-48 w-full border-0"
      />
      <div className="p-3">
        <a
          href={mapExternalUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center rounded-xl border border-border px-3 py-2 text-xs font-medium transition-opacity hover:opacity-80"
        >
           {t("profile.directions")} </a>
      </div>
    </div>
  );
}
