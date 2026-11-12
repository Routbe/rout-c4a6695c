import type { CSSProperties, ReactNode } from "react";
import type { BadgeBackdrop as BadgeBackdropStyle } from "@/lib/profile-display";

/**
 * Zet een gekozen achterzetsel achter een badge zodat het vinkje leesbaar
 * blijft — óók op een zwarte of drukke achtergrond.
 *
 *  • `glow`    — zachte lichtgloed rondom
 *  • `sticker` — gevulde ronde sticker erachter
 *  • `ring`    — fijn randje errond
 */
export function BadgeBackdrop({
  variant,
  color,
  size = "sm",
  children,
}: {
  variant: BadgeBackdropStyle;
  color?: string | null;
  size?: "sm" | "md";
  children: ReactNode;
}) {
  if (variant === "none") return <>{children}</>;

  const tint = color?.trim() || "#ffffff";
  const pad = size === "md" ? "p-1.5" : "p-1";
  const style: CSSProperties =
    variant === "glow"
      ? { boxShadow: `0 0 0 2px ${tint}33, 0 0 14px 2px ${tint}80` }
      : variant === "sticker"
        ? { background: tint, boxShadow: `0 1px 3px rgba(0,0,0,.28)` }
        : { boxShadow: `0 0 0 1.5px ${tint}` };

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${pad}`}
      style={style}
    >
      {children}
    </span>
  );
}
