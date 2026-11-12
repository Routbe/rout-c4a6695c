import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useReducedMotion } from "motion/react";
import { AtSign, BadgeCheck, CalendarDays, Check, Fingerprint, Github, Globe, Heart, KeyRound, Lock, Mail, Music2, Nfc, QrCode, Snowflake, Users, X } from "lucide-react";
import type { TopicSlug } from "@/lib/discover/topics";
import { finderOrigins, qrModules } from "./qr-grid";

/** Decorative, animated scene per product line. Purely visual: hidden from assistive tech. */
export function TopicVisual({ slug, compact = false }: { slug: TopicSlug; compact?: boolean }) {
  const Scene = SCENES[slug];
  return (
    <div className="dv-stage" data-compact={compact ? "true" : "false"} aria-hidden>
      <Scene />
    </div>
  );
}

function QrSvg({ size = 25, seed = 7, className }: { size?: number; seed?: number; className?: string }) {
  const cells = useMemo(() => qrModules(size, seed), [size, seed]);
  return (
    <svg viewBox={`-1 -1 ${size + 2} ${size + 2}`} className={className}>
      {cells.map((on, i) => on ? <rect key={i} className="dv-qr-dot" x={i % size + 0.08} y={Math.floor(i / size) + 0.08} width={0.84} height={0.84} rx={0.28} style={{ animationDelay: `${((i % size) + Math.floor(i / size)) * 45}ms` }} /> : null)}
      {finderOrigins(size).map(([x, y]) => (
        <g key={`${x}-${y}`} className="dv-qr-eye">
          <rect x={x + 0.5} y={y + 0.5} width={6} height={6} rx={1.6} fill="none" strokeWidth={1} />
          <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.8} />
        </g>
      ))}
    </svg>
  );
}

function ProfilesScene() {
  const rows = [Globe, CalendarDays, Music2, Github];
  return (
    <div className="dv-scene">
      <div className="dv-phone">
        <div className="dv-phone-notch" />
        <div className="dv-avatar"><span /></div>
        <div className="dv-line dv-line-lg" />
        <div className="dv-line dv-line-sm" />
        <div className="dv-live"><span className="dv-eq"><i /><i /><i /><i /></span><span className="dv-line dv-line-xs" /></div>
        {rows.map((Icon, i) => (
          <div key={i} className="dv-row" style={{ animationDelay: `${300 + i * 160}ms` }}><Icon className="h-3.5 w-3.5" /><span className="dv-line" /></div>
        ))}
      </div>
      <div className="dv-float dv-float-a"><AtSign className="h-3.5 w-3.5" /><span className="dv-line dv-line-xs" /></div>
      <div className="dv-float dv-float-b"><BadgeCheck className="h-3.5 w-3.5" /><span className="dv-line dv-line-xs" /></div>
    </div>
  );
}

function QrScene() {
  return (
    <div className="dv-scene">
      <div className="dv-panel dv-qr-panel">
        <QrSvg className="dv-qr" />
        <div className="dv-scanline" />
      </div>
      <div className="dv-swatches">{[0, 1, 2, 3, 4].map((i) => <span key={i} data-i={i} />)}</div>
      <div className="dv-float dv-float-a"><span className="dv-tag">SVG</span><span className="dv-tag">PDF</span></div>
    </div>
  );
}

function LinksScene() {
  return (
    <div className="dv-scene">
      <div className="dv-panel dv-chart">
        <div className="dv-pill"><QrCode className="h-3.5 w-3.5" /> rout.be/s/…</div>
        <svg viewBox="0 0 300 120" className="dv-chart-svg" preserveAspectRatio="none">
          <path className="dv-area" d="M0 110 L0 92 C30 88 40 70 70 74 C100 78 110 50 140 54 C170 58 180 30 210 34 C240 38 260 14 300 10 L300 110 Z" />
          <path className="dv-stroke" d="M0 92 C30 88 40 70 70 74 C100 78 110 50 140 54 C170 58 180 30 210 34 C240 38 260 14 300 10" />
        </svg>
        <div className="dv-bars">{[62, 38, 24].map((w, i) => <span key={i} style={{ width: `${w}%`, animationDelay: `${600 + i * 150}ms` }} />)}</div>
      </div>
      <div className="dv-float dv-float-b dv-dots">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 220}ms` }} />)}</div>
    </div>
  );
}

function IdScene() {
  const rows: [typeof Check, boolean][] = [[Check, true], [Check, true], [X, false]];
  return (
    <div className="dv-scene">
      <div className="dv-panel dv-consent">
        <div className="dv-consent-head">
          <span className="dv-app" />
          <span className="dv-link"><i /></span>
          <span className="dv-app dv-app-rout">R</span>
        </div>
        {rows.map(([Icon, ok], i) => (
          <div key={i} className="dv-check" data-ok={ok ? "true" : "false"} style={{ animationDelay: `${400 + i * 200}ms` }}><span className="dv-box"><Icon className="h-3 w-3" /></span><span className="dv-line" /></div>
        ))}
        <div className="dv-relay"><Mail className="h-3.5 w-3.5" /><span className="dv-line dv-line-sm" /><Lock className="h-3 w-3" /></div>
      </div>
      <div className="dv-print"><Fingerprint className="h-10 w-10" /><span /><span /></div>
    </div>
  );
}

function useTicker(ms: number, enabled: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setN((v) => v + 1), ms);
    return () => window.clearInterval(id);
  }, [ms, enabled]);
  return n;
}

function CardScene() {
  const reduced = useReducedMotion();
  const tick = useTicker(2400, !reduced);
  // Purely illustrative digits, not a real code.
  const code = String((482913 + tick * 7919) % 1_000_000).padStart(6, "0");
  return (
    <div className="dv-scene">
      <div className="dv-card-wrap">
        <div className="dv-card">
          <div className="dv-card-top"><span className="dv-card-logo">ROUT</span><Nfc className="h-5 w-5" /></div>
          <div className="dv-chip" />
          <div className="dv-card-bottom"><span className="dv-card-code" key={code}>{code.slice(0, 3)} {code.slice(3)}</span><QrSvg size={21} seed={tick + 3} className="dv-card-qr" /></div>
          <div className="dv-sheen" />
        </div>
        <div className="dv-nfc"><span /><span /><span /></div>
      </div>
      <div className="dv-float dv-float-b"><Snowflake className="h-3.5 w-3.5" /><span className="dv-toggle"><i /></span></div>
    </div>
  );
}

function SupportScene() {
  return (
    <div className="dv-scene">
      <div className="dv-phone dv-phone-wide">
        <div className="dv-avatar dv-avatar-sm"><span /></div>
        <div className="dv-line dv-line-lg" />
        <div className="dv-amounts">{["3", "5", "10"].map((a, i) => <span key={a} data-on={i === 1 ? "true" : "false"}>€{a}</span>)}</div>
        <div className="dv-epc"><QrSvg size={21} seed={42} /></div>
        <div className="dv-line dv-line-sm" />
      </div>
      <div className="dv-hearts">{[0, 1, 2, 3, 4].map((i) => <Heart key={i} className="h-4 w-4" style={{ animationDelay: `${i * 700}ms`, left: `${18 + i * 16}%` }} />)}</div>
      <div className="dv-float dv-float-a"><span className="dv-tag">IBAN</span><span className="dv-tag">SEPA</span></div>
    </div>
  );
}

function QuestionsScene() {
  return (
    <div className="dv-scene">
      <div className="dv-ngl">
        <div className="dv-ngl-head"><div className="dv-avatar dv-avatar-sm"><span /></div><span className="dv-line dv-line-lg" /></div>
        <div className="dv-ngl-body"><span className="dv-line" /><span className="dv-line dv-line-sm" /></div>
        <div className="dv-ngl-btn" />
      </div>
      <div className="dv-bubbles">{[0, 1, 2, 3].map((i) => <span key={i} style={{ animationDelay: `${i * 900}ms` }}>?</span>)}</div>
    </div>
  );
}

function WorkspacesScene() {
  return (
    <div className="dv-scene">
      <div className="dv-orbit">
        <div className="dv-core"><Users className="h-6 w-6" /></div>
        <div className="dv-ring dv-ring-1">{[0, 1, 2].map((i) => <span key={i} className="dv-node" style={{ transform: `rotate(${i * 120}deg) translateX(var(--r)) rotate(${-i * 120}deg)` }} />)}</div>
        <div className="dv-ring dv-ring-2">{[0, 1, 2, 3].map((i) => <span key={i} className="dv-node dv-node-sm" style={{ transform: `rotate(${45 + i * 90}deg) translateX(var(--r)) rotate(${-45 - i * 90}deg)` }} />)}</div>
      </div>
      <div className="dv-float dv-float-a"><Globe className="h-3.5 w-3.5" /><span className="dv-mono">rout.be/w/…</span></div>
      <div className="dv-float dv-float-b"><QrCode className="h-3.5 w-3.5" /><span className="dv-line dv-line-xs" /></div>
    </div>
  );
}

function DevelopersScene() {
  const lines = [
    ["$", "rout apps create --oidc"],
    ["✓", "client_id  rout_app_7f3c"],
    ["✓", "pkce       S256"],
    ["→", "scope      openid profile"],
    ["✓", "webhook    signed · HMAC"],
  ];
  return (
    <div className="dv-scene">
      <div className="dv-panel dv-term">
        <div className="dv-term-bar"><i /><i /><i /></div>
        {lines.map(([p, l], i) => <p key={i} style={{ animationDelay: `${i * 450}ms` }}><span>{p}</span> {l}</p>)}
        <p className="dv-caret" style={{ animationDelay: `${lines.length * 450}ms` }}><span>$</span> <i /></p>
      </div>
      <div className="dv-float dv-float-b"><KeyRound className="h-3.5 w-3.5" /><span className="dv-mono">MCP</span></div>
    </div>
  );
}

function BookingsScene() {
  const reduced = useReducedMotion();
  const tick = useTicker(1000, !reduced);
  // Illustrative countdown from 4:59, looping every 12 s with the ring.
  const left = 299 - (tick % 12) * 25;
  const free = new Set([8, 9, 10, 11, 15, 16, 17, 18, 19, 22, 23, 25, 26, 29, 30, 31, 32]);
  return (
    <div className="dv-scene">
      <div className="dv-panel dv-cal">
        <div className="dv-cal-head"><span className="dv-line dv-line-sm" /><CalendarDays className="h-4 w-4" style={{ color: "var(--tp)" }} /></div>
        <div className="dv-cal-grid">
          {Array.from({ length: 35 }, (_, i) => (
            <span key={i} data-free={free.has(i) ? "true" : "false"} data-pick={i === 16 ? "true" : "false"} style={{ animationDelay: `${i * 30}ms` }} />
          ))}
        </div>
        <div className="dv-cal-times">{[0, 1, 2, 3, 4, 5].map((i) => <span key={i} data-held={i === 1 ? "true" : "false"} />)}</div>
      </div>
      <div className="dv-float dv-hold">
        <svg viewBox="0 0 28 28" className="dv-hold-ring"><circle className="dv-hold-track" cx="14" cy="14" r="12" /><circle className="dv-hold-left" cx="14" cy="14" r="12" /></svg>
        <span className="dv-mono">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>
      </div>
    </div>
  );
}

const SCENES: Record<TopicSlug, ComponentType> = {
  profiles: ProfilesScene,
  "qr-studio": QrScene,
  links: LinksScene,
  "rout-id": IdScene,
  "rout-card": CardScene,
  "creator-support": SupportScene,
  questions: QuestionsScene,
  workspaces: WorkspacesScene,
  developers: DevelopersScene,
  bookings: BookingsScene,
};
