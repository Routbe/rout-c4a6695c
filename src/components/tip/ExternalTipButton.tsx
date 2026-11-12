import { Coffee, Heart, HandCoins, Landmark, Wallet, ArrowUpRight } from "lucide-react";
import { EXTERNAL_TIP_CATALOG, type ExternalTipKind } from "@/lib/tip-rules";

const ICONS: Record<ExternalTipKind, typeof Coffee> = {
  buymeacoffee: Coffee,
  kofi: Heart,
  paypal: Wallet,
  bunq: Landmark,
  patreon: HandCoins,
  liberapay: HandCoins,
};

/** Externe steunlink in de officiële merkkleur, even strak als de ingebouwde betaalknoppen. */
export function ExternalTipButton({ kind, value }: { kind: ExternalTipKind; value: string }) {
  const meta = EXTERNAL_TIP_CATALOG[kind];
  const Icon = ICONS[kind];
  return (
    <a
      href={meta.url(value)}
      target="_blank"
      rel="noopener noreferrer"
      // Merkkleuren zijn bewust vast: dit zijn de officiële kleuren van de dienst.
      style={{ backgroundColor: meta.color, color: meta.ink }}
      className="group flex h-12 items-center gap-3 rounded-full px-5 text-sm font-semibold shadow-sm ring-1 ring-black/5 transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span className="flex-1">{meta.label}</span>
      <span className="text-xs font-medium opacity-70">/{value}</span>
      <ArrowUpRight className="h-4 w-4 opacity-70 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </a>
  );
}
