import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { motion, useReducedMotion } from "motion/react";
import { snappySpringPreset } from "@/lib/spatial-motion";

/** Critically damped: the knob settles without bouncing past the end of its track. */
const SWITCH_SPRING = { ...snappySpringPreset, damping: 40 };

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => {
  const ownRef = React.useRef<HTMLButtonElement | null>(null);
  const thumbRef = React.useRef<HTMLSpanElement | null>(null);
  const [checked, setChecked] = React.useState(Boolean(props.checked ?? props.defaultChecked));
  // Travel is measured from the real track, so the knob always ends inside its frame
  // whatever size, border or padding a material or caller gives the switch.
  const [travel, setTravel] = React.useState(20);
  const reduced = useReducedMotion();
  React.useEffect(() => {
    const element = ownRef.current;
    if (!element) return;
    const sync = () => setChecked(element.dataset["state"] === "checked");
    const measure = () => {
      const thumb = thumbRef.current;
      if (!thumb) return;
      const cs = getComputedStyle(element);
      const inner = element.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const next = Math.max(0, Math.floor(inner - thumb.offsetWidth));
      if (Number.isFinite(next)) setTravel(next);
    };
    sync();
    measure();
    const observer = new MutationObserver(sync);
    observer.observe(element, { attributes: true, attributeFilter: ["data-state"] });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    resize?.observe(element);
    return () => { observer.disconnect(); resize?.disconnect(); };
  }, []);
  return (
  <SwitchPrimitives.Root
    className={cn(
      "spatial-switch peer relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center overflow-hidden rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
    ref={(element) => { ownRef.current = element; if (typeof ref === "function") ref(element); else if (ref) ref.current = element; }}
  >
    <SwitchPrimitives.Thumb asChild><motion.span
      ref={thumbRef}
      className="spatial-switch-thumb pointer-events-none block h-[18px] w-[18px] shrink-0 rounded-full ring-0"
      initial={false} animate={{ x: checked ? travel : 0 }} transition={reduced ? { duration: 0 } : SWITCH_SPRING}
    /></SwitchPrimitives.Thumb>
  </SwitchPrimitives.Root>
  );
});
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
