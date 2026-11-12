import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { motion, useReducedMotion } from "motion/react";
import { snappySpringPreset } from "@/lib/spatial-motion";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;
const IndicatorContext = React.createContext<{ id: string; hovered: string | null; setHovered: (v: string | null) => void } | null>(null);

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, onPointerLeave, ...props }, ref) => {
  const id = React.useId();
  const [hovered, setHovered] = React.useState<string | null>(null);
  return <IndicatorContext.Provider value={{ id, hovered, setHovered }}><TabsPrimitive.List
    ref={ref}
    className={cn(
      "spatial-track inline-flex h-10 items-center justify-center p-1 text-muted-foreground",
      className,
    )}
    {...props}
    onPointerLeave={(e) => { setHovered(null); onPointerLeave?.(e); }}
  />
  </IndicatorContext.Provider>;
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, onPointerEnter, onFocus, onBlur, ...props }, ref) => {
  const context = React.useContext(IndicatorContext);
  const ownRef = React.useRef<HTMLButtonElement | null>(null);
  const [selected, setSelected] = React.useState(false);
  const reduced = useReducedMotion();
  React.useEffect(() => {
    const el = ownRef.current;
    if (!el) return;
    const sync = () => setSelected(el.dataset["state"] === "active");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(el, { attributes: true, attributeFilter: ["data-state"] });
    return () => observer.disconnect();
  }, []);
  return (
  <TabsPrimitive.Trigger
    ref={(el) => { ownRef.current = el; if (typeof ref === "function") ref(el); else if (ref) ref.current = el; }}
    className={cn(
      "spatial-tab inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed data-[state=active]:text-foreground",
      className,
    )}
    {...props}
    onPointerEnter={(e) => { if (!props.disabled) context?.setHovered(props.value); onPointerEnter?.(e); }}
    onFocus={(e) => { context?.setHovered(props.value); onFocus?.(e); }}
    onBlur={(e) => { context?.setHovered(null); onBlur?.(e); }}
  >
    {context && selected && <motion.span aria-hidden className="spatial-indicator" initial={false} layoutId={`tab-indicator-${context.id}`} transition={reduced ? { duration: 0 } : snappySpringPreset} />}
    {children}
  </TabsPrimitive.Trigger>
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
