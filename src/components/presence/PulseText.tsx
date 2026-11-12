import { cn } from "@/lib/utils";
import type { PulseAlign, PulseBg, PulseFont } from "@/lib/presence";

/** Visual text pulse used by the viewer and the composer preview (one render path). */
export function PulseText({ text, bg, font, align, sticker, size = "lg", className }: {
  text: string; bg?: PulseBg | null; font?: PulseFont | null; align?: PulseAlign | null; sticker?: string | null;
  size?: "sm" | "lg"; className?: string;
}) {
  const a = align ?? "center";
  return (
    <div className={cn("relative flex h-full w-full flex-col justify-center overflow-hidden", bg && bg !== "none" && `pulse-bg-${bg}`, size === "lg" ? "gap-4 px-6" : "gap-1.5 px-3", className)}>
      {sticker && <span aria-hidden className={cn("drop-shadow-lg", size === "lg" ? "text-6xl" : "text-2xl", a === "left" ? "self-start" : a === "right" ? "self-end" : "self-center")}>{sticker}</span>}
      <p
        className={cn("whitespace-pre-wrap break-words leading-snug drop-shadow", `pulse-font-${font ?? "classic"}`, size === "lg" ? "text-3xl" : "text-sm", a === "left" ? "text-left" : a === "right" ? "text-right" : "text-center")}
      >{text}</p>
    </div>
  );
}
