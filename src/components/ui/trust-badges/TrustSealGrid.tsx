import { useRef, useState, type ReactElement } from "react";
import { Link } from "@/lib/router-compat";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GdprSeal } from "./GdprSeal";
import { ClientSideSeal } from "./ClientSideSeal";
import { AgplSeal } from "./AgplSeal";
import { EeaSeal } from "./EeaSeal";
import { ZeroTrackerSeal } from "./ZeroTrackerSeal";

interface Seal {
  id: string;
  label: string;
  Seal: (p: { className?: string }) => ReactElement;
  claim: string;
  tag: string;
  proof: { label: string; detail: string }[];
  href?: string;
}

const SEALS: Seal[] = [
  {
    id: "client-side",
    tag: "Zero-Knowledge Sandbox",
    label: "Client-Side Engine",
    Seal: ClientSideSeal,
    claim: "Static QR generation runs entirely inside your browser sandbox.",
    proof: [
      {
        label: "Local execution",
        detail:
          "Matrix computation, styling and rasterisation happen on your CPU in a Web Worker. No payload leaves the tab.",
      },
      {
        label: "Verify it yourself",
        detail:
          "Open the network panel while generating a static code — there is no outbound request carrying your data.",
      },
    ],
  },
  {
    id: "eea",
    tag: "EU Data Residency",
    label: "EEA Hosting",
    Seal: EeaSeal,
    claim: "Application servers, databases and backups stay inside the EEA.",
    proof: [
      {
        label: "Residency",
        detail:
          "Managed PostgreSQL, backups and routing proxies operate strictly inside the European Economic Area.",
      },
      {
        label: "No durable IP logs",
        detail: "Transport metadata is processed in memory for routing and DDoS mitigation only.",
      },
    ],
  },
  {
    id: "gdpr",
    tag: "GDPR / AVG Compliant",
    label: "GDPR / AVG",
    Seal: GdprSeal,
    claim: "Data minimisation by design under Belgian GBA/APD oversight.",
    proof: [
      {
        label: "Minimisation",
        detail:
          "Only the fields required to resolve a dynamic link are stored, and only as long as the link lives.",
      },
      {
        label: "Your rights",
        detail: "Access, rectification, erasure and portability are handled from /privacy.",
      },
    ],
    href: "/privacy",
  },
  {
    id: "agpl",
    tag: "AGPLv3 (Network Copyleft)",
    label: "AGPL-3.0-or-later",
    Seal: AgplSeal,
    claim: "The full source is auditable and self-hostable.",
    proof: [
      {
        label: "Network clause",
        detail:
          "Any hosted fork must publish its modifications, so the guarantees travel with the code.",
      },
      {
        label: "Self-hosting",
        detail: "A first-class path, documented in the self-hosting guide.",
      },
    ],
    href: "/self-hosting",
  },
  {
    id: "no-trackers",
    tag: "Privacy First",
    label: "Zero Trackers",
    Seal: ZeroTrackerSeal,
    claim: "No advertising cookies, fingerprinting or third-party analytics.",
    proof: [
      {
        label: "No third-party scripts",
        detail: "The document loads no advertising or profiling script.",
      },
      {
        label: "Coarse analytics only",
        detail: "Scan stats are timestamp, country and device family — never identities.",
      },
    ],
  },
];

/** Interactive seal grid: hover micro-interactions, click for verifiable proof. */
export function TrustSealGrid() {
  const { t } = useI18n();
  const k = (id: string, part: string) => t(`pages.seals.${id}.${part}`);
  const seals: Seal[] = SEALS.map((seal) => ({
    ...seal,
    label: k(seal.id, "label"),
    tag: k(seal.id, "tag"),
    claim: k(seal.id, "claim"),
    proof: seal.proof.map((_, i) => ({ label: k(seal.id, `p${i}.label`), detail: k(seal.id, `p${i}.detail`) })),
  }));
  const [open, setOpen] = useState<Seal | null>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastTriggerId = useRef<string | null>(null);

  const closeDialog = () => {
    setOpen(null);
    // Explicitly restore focus to the exact badge that opened the dialog,
    // even if Radix's own focus-return heuristics miss it (backdrop click, ESC).
    const id = lastTriggerId.current;
    if (id) {
      requestAnimationFrame(() => triggerRefs.current[id]?.focus());
    }
  };

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {seals.map((s, i) => (
          <button
            key={s.id}
            id={s.id}
            ref={(el) => {
              triggerRefs.current[s.id] = el;
            }}
            type="button"
            onClick={() => {
              lastTriggerId.current = s.id;
              setOpen(s);
            }}
            aria-haspopup="dialog"
            aria-expanded={open?.id === s.id}
            aria-label={t("pages.seals.viewProof", { label: s.label })}
            className={cn(
              "group flex scroll-mt-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-border/50 bg-card/40 p-4 text-center backdrop-blur-sm sm:p-5",
              "transition-all duration-300 ease-out hover:border-primary/60 hover:scale-[1.03]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              i === SEALS.length - 1 && SEALS.length % 2 === 1 ? "col-span-2 sm:col-span-1" : "",
            )}
          >
            <s.Seal className="size-16 text-foreground transition-transform duration-300 ease-out group-hover:rotate-[15deg] sm:size-20" />
            <span className="mt-2 block text-xs font-medium text-foreground sm:text-sm">
              {s.label}
            </span>
            <span className="mt-0.5 block max-w-full truncate text-[11px] text-muted-foreground">
              {s.tag}
            </span>
          </button>
        ))}
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="max-w-md">
          {open ? (
            <>
              <DialogHeader>
                <open.Seal className="size-20 text-foreground" />
                <DialogTitle className="font-serif">{open.label}</DialogTitle>
                <DialogDescription>{open.claim}</DialogDescription>
              </DialogHeader>
              <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                {open.proof.map((p) => (
                  <li key={p.label}>
                    <strong className="block font-mono text-[11px] text-foreground">
                      {p.label}
                    </strong>
                    {p.detail}
                  </li>
                ))}
              </ul>
              {open.href ? (
                <Link
                  to={open.href}
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-medium transition-colors hover:bg-accent"
                >
                  {t("pages.seals.docs")}
                </Link>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
