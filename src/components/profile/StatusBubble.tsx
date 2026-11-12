import type { CSSProperties, ReactNode } from "react";
import { BUBBLE_FONTS, contrastText, type BubbleFont, type BubblePosition, type BubbleStyle } from "@/lib/status-bubble";

/** Floating speech bubble anchored to the avatar; its tail points at the avatar centre. */
export function StatusBubble({ text, position, bubbleStyle, bg, font, className = "", extra }: {
  text: string; extra?: ReactNode; position: BubblePosition; bubbleStyle: BubbleStyle; bg: string | null; font: BubbleFont; className?: string;
}) {
  const style: CSSProperties = { fontFamily: BUBBLE_FONTS.find((f) => f.id === font)?.css };
  if (bg) {
    (style as Record<string, string>)["--bb-bg"] = bg;
    (style as Record<string, string>)["--bb-fg"] = contrastText(bg);
  }
  return (
    <div className={`status-bubble-anchor ${className}`} data-pos={position}>
      <div className="status-bubble" data-pos={position} data-style={bubbleStyle} data-custom={bg ? "1" : undefined} style={style} role="status">
        {text && <span className="line-clamp-2 break-words">{text}</span>}
        {extra}
      </div>
    </div>
  );
}
