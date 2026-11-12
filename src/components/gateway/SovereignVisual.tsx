import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
const Scene = lazy(() => import('./SovereignScene'));
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}
export function SovereignVisual() {
  const host = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [active, setActive] = useState(true);
  const [ready, setReady] = useState(false);
  const [colors, setColors] = useState<{ ink: string; emerald: string; cyan: string } | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const style = getComputedStyle(host.current);
    setColors({ ink: style.getPropertyValue('--sovereign-ink').trim(), emerald: style.getPropertyValue('--sovereign-emerald').trim(), cyan: style.getPropertyValue('--sovereign-cyan').trim() });
    let visible = true;
    const update = () => setActive(visible && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; update(); });
    observer.observe(host.current);
    document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  return <div ref={host} data-sovereign-scene data-liquid-glass data-scene-ready={ready || undefined} className="sovereign-scene" aria-hidden>
    <div className="sovereign-fallback" />
    {colors && <SceneBoundary><Suspense fallback={null}><Scene active={active} reduced={Boolean(reduced)} colors={colors} onReady={() => setReady(true)} /></Suspense></SceneBoundary>}
  </div>;
}
