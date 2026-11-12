import {
  Award,
  BadgeCheck,
  Crown,
  Flame,
  Gem,
  Handshake,
  Heart,
  Lock,
  Megaphone,
  Rocket,
  Share2,
  Shield,
  Sparkles,
  Star,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { BadgeRarity } from "@/lib/badges";
import { cn } from "@/lib/utils";

/**
 * Zichtbare badgevorm + logo.
 *
 * De verzameling toonde eerder overal hetzelfde generieke schildje. Elke badge
 * heeft nu een eigen vorm (bepaald door de zeldzaamheid) en een eigen logo
 * (uit `badges.icon`, met een slug-fallback), zodat je verzameling er als een
 * verzameling uitziet.
 */

const ICONS: Record<string, LucideIcon> = {
  award: Award,
  "badge-check": BadgeCheck,
  verified: BadgeCheck,
  crown: Crown,
  founder: Crown,
  flame: Flame,
  fire: Flame,
  gem: Gem,
  diamond: Gem,
  handshake: Handshake,
  connector: Handshake,
  heart: Heart,
  supporter: Heart,
  megaphone: Megaphone,
  influencer: Megaphone,
  rocket: Rocket,
  "early-believer": Rocket,
  early_believer: Rocket,
  beta: Rocket,
  share2: Share2,
  share: Share2,
  sharer: Share2,
  shield: Shield,
  bluesky: Sparkles,
  sparkles: Sparkles,
  star: Star,
  trophy: Trophy,
  users: Users,
  zap: Zap,
};

/** Zeldzaamheid bepaalt de vorm én de accentkleur van de rand. */
const SHAPE: Record<BadgeRarity, string> = {
  common: "rounded-xl",
  uncommon: "rounded-full",
  rare: "[clip-path:polygon(50%_0%,93%_25%,93%_75%,50%_100%,7%_75%,7%_25%)]",
  epic: "[clip-path:polygon(50%_0%,100%_38%,82%_100%,18%_100%,0%_38%)]",
  artifact:
    "[clip-path:polygon(50%_0%,61%_16%,80%_10%,82%_30%,100%_39%,88%_54%,97%_72%,78%_77%,73%_96%,55%_89%,38%_100%,28%_84%,9%_86%,11%_66%,0%_52%,15%_38%,10%_19%,30%_18%,38%_2%)]",
};

const RARITY_TINT: Record<BadgeRarity, string> = {
  common: "#8b8b93",
  uncommon: "#4ba07a",
  rare: "#3ea6ff",
  epic: "#a855f7",
  artifact: "#c9a227",
};

function normalizeKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/_/g, "-");
}

export function badgeIconFor(icon?: string | null, slug?: string | null): LucideIcon {
  return ICONS[normalizeKey(icon)] ?? ICONS[normalizeKey(slug)] ?? Award;
}

export function BadgeMedallion({
  icon,
  slug,
  color,
  rarity = "common",
  locked = false,
  size = "md",
  className,
}: {
  icon?: string | null;
  slug?: string | null;
  color?: string | null;
  rarity?: BadgeRarity | null;
  locked?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const r = (rarity ?? "common") as BadgeRarity;
  const Icon = locked ? Lock : badgeIconFor(icon, slug);
  const tint = (color && /^#|^rgb|^hsl|^oklch/.test(color) ? color : null) ?? RARITY_TINT[r];
  const box = size === "lg" ? "h-14 w-14" : size === "sm" ? "h-7 w-7" : "h-10 w-10";
  const glyph = size === "lg" ? "h-6 w-6" : size === "sm" ? "h-3.5 w-3.5" : "h-[18px] w-[18px]";

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        box,
        SHAPE[r] ?? SHAPE.common,
        locked && "opacity-50 grayscale",
        className,
      )}
      style={{
        background: `radial-gradient(circle at 30% 25%, color-mix(in oklab, ${tint} 45%, transparent), color-mix(in oklab, ${tint} 12%, transparent))`,
        boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${tint} 55%, transparent)`,
        color: tint,
      }}
    >
      <Icon className={glyph} strokeWidth={1.8} />
    </span>
  );
}
