import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Lightbulb } from "lucide-react";
import { Accordion } from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { analyzePageConversion } from "@/lib/conversion-coach";
import { cn } from "@/lib/utils";
import { ConversionCoachAccordion } from "./ConversionCoachAccordion";

type Props = ComponentProps<typeof ConversionCoachAccordion>;
const HIDE_KEY = "rout.coachFab.hidden";

/** Floating lightbulb with the live score; opens the coach. Big tap target, collapses while scrolling, can be tucked away. */
export function ConversionCoachFab(props: Props) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [compact, setCompact] = useState(false);
  const isMobile = useIsMobile();
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { blocks, avatarUrl, bio, verified, extraPageActive } = props;
  const score = analyzePageConversion({ blocks, avatarUrl, bio, verified, extraPageActive }).percent;

  useEffect(() => {
    setHidden(window.localStorage.getItem(HIDE_KEY) === "1");
    const onScroll = () => {
      setCompact(true);
      if (idle.current) clearTimeout(idle.current);
      idle.current = setTimeout(() => setCompact(false), 700);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (idle.current) clearTimeout(idle.current);
    };
  }, []);

  function setHide(v: boolean) {
    setHidden(v);
    window.localStorage.setItem(HIDE_KEY, v ? "1" : "0");
  }

  const bottom = { bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)" };

  return (
    <>
      {hidden ? (
        <button
          type="button"
          onClick={() => { setHide(false); setOpen(true); }}
          aria-label={`Conversie Coach openen, ${score}% voltooid`}
          style={bottom}
          className="fixed right-3 z-40 flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-border bg-card shadow-md md:!bottom-5 md:right-5"
        >
          <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="20" cy="20" r="17" fill="none" strokeWidth="3" className="stroke-muted" />
            <circle cx="20" cy="20" r="17" fill="none" strokeWidth="3" strokeLinecap="round"
              className="stroke-primary transition-[stroke-dashoffset] duration-500"
              strokeDasharray={2 * Math.PI * 17} strokeDashoffset={2 * Math.PI * 17 * (1 - Math.min(100, Math.max(0, score)) / 100)} />
          </svg>
          <span className="text-[10px] font-bold tabular-nums">{score}%</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Conversie Coach openen, score ${score} van 100`}
          style={bottom}
          className={cn(
            "fixed right-3 z-40 flex min-h-12 touch-manipulation items-center gap-2 rounded-full border border-border bg-card p-2 shadow-lg transition-all md:!bottom-5 md:right-5 md:hover:scale-105",
            compact ? "p-1" : "pr-4",
          )}
        >
          <span className="relative flex h-10 w-10 items-center justify-center">
            <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="20" cy="20" r="17" fill="none" strokeWidth="3" className="stroke-muted" />
              <circle cx="20" cy="20" r="17" fill="none" strokeWidth="3" strokeLinecap="round"
                className="stroke-primary transition-[stroke-dashoffset] duration-500"
                strokeDasharray={2 * Math.PI * 17} strokeDashoffset={2 * Math.PI * 17 * (1 - Math.min(100, Math.max(0, score)) / 100)} />
            </svg>
            {compact
              ? <span className="text-[10px] font-bold tabular-nums">{score}%</span>
              : <Lightbulb className="h-4 w-4 text-primary" aria-hidden />}
          </span>
          {!compact && <span className="text-sm font-semibold tabular-nums">{score}% voltooid</span>}
        </button>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn("overflow-y-auto", isMobile ? "max-h-[85vh] rounded-t-2xl" : "w-full sm:max-w-md")}
        >
          <SheetHeader>
            <SheetTitle>💡 Conversie Coach</SheetTitle>
          </SheetHeader>
          <Accordion type="single" collapsible defaultValue="conversion_tips" className="mt-4">
            <ConversionCoachAccordion {...props} />
          </Accordion>
          <Button
            variant="ghost"
            size="sm"
            className="mt-4 text-muted-foreground"
            onClick={() => { setHide(true); setOpen(false); }}
          >
            Verkleinen tot bolletje
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
}
