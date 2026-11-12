import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { VerifiedIdentityIcon } from "./VerifiedIdentityIcon";
import type { ShowcaseCard } from "@/lib/showcase.functions";
import { showcaseDisplay } from "@/lib/showcase-display";
import { profileImageSrc } from "@/lib/image-proxy-rules";
import { avatarShapeStyle, fontPairingOf, nameAccentStyle } from "@/lib/profile-display";
import { themeOf } from "@/lib/profile";
import { AvatarFrameWrapper } from "./AvatarFrameWrapper";
import { BadgeBackdrop } from "./BadgeBackdrop";
import { CreatorBadgeIcon } from "./CreatorBadgeIcon";
import { DomainBadgeIcon } from "./DomainBadgeIcon";
import { cn } from "@/lib/utils";
import { profileSurface } from "@/lib/profile-surface";

export function ShowcaseAvatar({ card, className = "size-10" }: { card: ShowcaseCard; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = profileImageSrc(card.avatarUrl);
  const p = card.display ?? showcaseDisplay(null);
  const shape = avatarShapeStyle(p.avatarShape);
  return <AvatarFrameWrapper frame={p.avatarFrame} decoration={p.avatarDecoration} theme={profileSurface(themeOf(card.theme ?? ""), p.canvasColor)}>
    {src && failed !== src
      ? <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} className={cn(className, shape.className, "shrink-0 border border-border object-cover")} style={shape.style} />
      : <span className={cn(className, shape.className, "flex shrink-0 items-center justify-center bg-muted font-serif font-semibold text-foreground")} style={shape.style}>{(card.displayName ?? card.handle).charAt(0).toUpperCase()}</span>}
  </AvatarFrameWrapper>;
}

export function ShowcaseName({ card }: { card: ShowcaseCard }) {
  const p = card.display ?? showcaseDisplay(null);
  const custom = p.typographyCustom || p.customDesign;
  return <span className="min-w-0 truncate" style={{ ...nameAccentStyle(p.nameAccent, { text: "var(--color-foreground)", accent: "var(--color-primary)" }), ...(custom ? { fontFamily: fontPairingOf(p.fontPairing).heading, textShadow: p.titleGlow > 0 ? `0 0 ${p.titleGlow}px currentColor` : undefined } : {}) }}>{card.displayName ?? card.handle}</span>;
}

/** Noninteractive version of the profile mark: cards themselves are links. */
export function ShowcaseMark({ card }: { card: ShowcaseCard }) {
  const p = card.display ?? showcaseDisplay(null);
  if (!card.verified || !p.badgeVisible || p.badgeType === "none") return null;
  const classes = "size-5 shrink-0";
  return <span className="inline-flex shrink-0" aria-hidden><BadgeBackdrop variant={p.badgeBackdrop} color={p.badgeBackdropColor} size="sm">
    {p.badgeType === "domain" ? <DomainBadgeIcon className={classes} /> : p.badgeType === "influencer" ? <CreatorBadgeIcon className={classes} /> : p.badgeType === "human" ? <ShieldCheck className={classes} /> : <VerifiedIdentityIcon className={classes} />}
  </BadgeBackdrop></span>;
}