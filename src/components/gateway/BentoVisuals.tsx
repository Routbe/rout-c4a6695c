import { useState, type ReactNode } from "react";
import { BadgeCheck, Play } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";

/** Card wrapper with a cursor-following radial glow (CSS vars, no re-render). */
export function GlowCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("glow-card", className)}>
      {children}
    </div>
  );
}

const ACCENTS = ["oklch(0.78 0.12 85)", "oklch(0.72 0.15 250)", "oklch(0.74 0.16 155)", "oklch(0.7 0.2 20)"] as const;

/** Identity: interactive phone mockup of a dark Profile Hub — visitors can switch the accent colour. */
export function ProfileHubVisual() {
  const [accent, setAccent] = useState<string>(ACCENTS[0]);
  return (
    <div className="flex items-end justify-center gap-4">
      <div className="relative h-56 w-32 shrink-0 rounded-[1.6rem] border border-border bg-background p-2 shadow-paper-xl">
        <div className="mx-auto mb-2 h-1 w-8 rounded-full bg-muted" />
        <div className="flex flex-col items-center gap-1.5 pt-2">
          <div className="h-10 w-10 rounded-full" style={{ background: `linear-gradient(135deg, ${accent}, transparent)` }} />
          <span className="flex items-center gap-1 text-[9px] font-medium text-foreground">
            jona <BadgeCheck className="h-2.5 w-2.5" style={{ color: accent }} aria-hidden />
          </span>
          <span className="text-[7px] text-muted-foreground">rout.be/u/jona</span>
          <div className="mt-1 flex w-full items-center gap-1.5 rounded-md border border-border bg-card p-1.5">
            <span className="grid h-4 w-4 place-items-center rounded-full" style={{ background: accent }}>
              <Play className="h-2 w-2 text-background" aria-hidden />
            </span>
            <span className="flex flex-1 items-end gap-[1.5px]" aria-hidden>
              {[3, 6, 4, 8, 5, 7, 3, 6, 4, 5, 7, 3].map((h, i) => (
                <span key={i} className="w-[2px] rounded-full bg-muted-foreground/60" style={{ height: h }} />
              ))}
            </span>
          </div>
          {[0, 1].map((i) => (
            <div key={i} className="h-4 w-full rounded-md border border-border bg-card" />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2 pb-2" role="group" aria-label="Kies een accentkleur">
        {ACCENTS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label="Accentkleur kiezen"
            aria-pressed={accent === c}
            onClick={(e) => { e.preventDefault(); setAccent(c); }}
            className={cn("h-5 w-5 rounded-full border-2 transition-transform hover:scale-110", accent === c ? "border-foreground" : "border-transparent")}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

/** Workspaces: connected team nodes, a domain route and a mini audit timeline. */
export function WorkspaceVisual() {
  const nodes = [
    { x: 30, y: 30 }, { x: 150, y: 22 }, { x: 40, y: 110 }, { x: 160, y: 105 },
  ];
  return (
    <div className="space-y-3">
      <svg viewBox="0 0 190 130" className="h-32 w-full" aria-hidden>
        {nodes.map((n, i) => (
          <line key={i} x1={95} y1={65} x2={n.x} y2={n.y} className="stroke-border" strokeWidth={1} strokeDasharray="3 3">
            <animate attributeName="stroke-dashoffset" from="12" to="0" dur={`${1.2 + i * 0.3}s`} repeatCount="indefinite" />
          </line>
        ))}
        <circle cx={95} cy={65} r={16} className="fill-primary/20 stroke-primary" strokeWidth={1.5} />
        <text x={95} y={69} textAnchor="middle" className="fill-foreground text-[9px] font-medium">W</text>
        {nodes.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r={8} className="fill-card stroke-muted-foreground" strokeWidth={1} />
        ))}
      </svg>
      <p className="truncate rounded-md border border-border bg-background px-2 py-1 text-center font-mono text-[11px] text-muted-foreground">
        maximilien.brussels → rout.be/w/maximilien
      </p>
      <div className="flex items-center gap-1.5" aria-hidden>
        {[1, 1, 0.6, 1, 0.4, 1].map((o, i) => (
          <span key={i} className="h-1.5 flex-1 rounded-full bg-primary" style={{ opacity: o * 0.7 }} />
        ))}
        <span className="ml-1 text-[10px] text-muted-foreground">Chronos</span>
      </div>
    </div>
  );
}

/** API: MCP snippet in a code window with a softly pulsing QR code. */
export function ApiVisual() {
  return (
    <div className="flex items-stretch gap-3">
      <pre className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-background p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
        <span className="text-foreground">$</span> npx @routbe/mcp-server{"\n"}
        <span className="text-primary">✓</span> tools: workspaces, qr{"\n"}
        <span className="text-primary">✓</span> scope: profile:draft{"\n"}
        <span className="animate-pulse text-foreground">▍</span>
      </pre>
      <div className="qr-pulse grid shrink-0 place-items-center rounded-lg border border-border bg-foreground p-2">
        <QRCodeSVG value="https://rout.be/developers" size={64} bgColor="transparent" className="text-background" fgColor="currentColor" />
      </div>
    </div>
  );
}
