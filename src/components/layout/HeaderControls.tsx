import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { premiumSpringPreset } from "@/lib/spatial-motion";

const ControlsContext = createContext<{ id: string; active: string | null; setActive: (id: string | null) => void } | null>(null);

/** One optical surface; its children retain their own dialog and account semantics. */
export function HeaderControls({ children }: { children: ReactNode }) {
  const id = useId();
  const [active, setActive] = useState<string | null>(null);
  return <ControlsContext.Provider value={{ id, active, setActive }}>
    <div className="spatial-control-pill" data-testid="header-controls" onPointerLeave={() => setActive(null)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setActive(null); }}>
      {children}
    </div>
  </ControlsContext.Provider>;
}

export function HeaderControl({ name, children }: { name: string; children: ReactNode }) {
  const context = useContext(ControlsContext);
  const reduced = useReducedMotion();
  if (!context) return <>{children}</>;
  return <div className="spatial-control-slot" data-control={name} onPointerEnter={() => context.setActive(name)} onFocus={() => context.setActive(name)}>
    {context.active === name && <motion.span aria-hidden className="spatial-indicator" layoutId={`header-control-${context.id}`} transition={reduced ? { duration: 0 } : premiumSpringPreset} />}
    {children}
  </div>;
}