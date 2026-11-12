import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ConversionCoach } from "@/components/dashboard/ConversionCoach";
import { analyzePageConversion, auditProfile, hasPrimaryAction, type ConversionFix } from "@/lib/conversion-coach";
import type { ProfileBlock } from "@/lib/profile";
import type { ProfileDisplayPrefs } from "@/lib/profile-display";
import { cn } from "@/lib/utils";

const CTA_EFFECTS: { id: ProfileDisplayPrefs["ctaEffect"]; label: string }[] = [
  { id: "none", label: "Geen" },
  { id: "glow", label: "Glow" },
  { id: "pulse", label: "Pulse" },
  { id: "shimmer", label: "Shimmer" },
];


interface Props {
  blocks: ProfileBlock[];
  avatarUrl: string | null;
  bio: string | null;
  displayName: string | null;
  prefs: ProfileDisplayPrefs;
  onPrefChange: <K extends keyof ProfileDisplayPrefs>(
    key: K,
    value: ProfileDisplayPrefs[K],
  ) => void;
  verified?: boolean;
  extraPageActive?: boolean;
  /** Voegt een blok toe (quick fix). */
  onAddKind: (kind: string) => void;
}

/**
 * 💡 Conversie Coach & Optimalisatie.
 *
 * Toont een live score, concrete quick fixes, het CTA-accent en een
 * OpenGraph-inspecteur die laat zien hoe je link in chat-apps oogt.
 */
export function ConversionCoachAccordion({
  blocks,
  avatarUrl,
  bio,
  displayName,
  prefs,
  onPrefChange,
  onAddKind,
  verified,
  extraPageActive,
}: Props) {
  const checklist = analyzePageConversion({ blocks, avatarUrl, bio, verified, extraPageActive });
  const audit = auditProfile({
    blocks,
    avatarUrl,
    bio,
    hasPrimaryAction: hasPrimaryAction(blocks),
    highlightActive: prefs.ctaEffect !== "none" && Boolean(prefs.ctaBlockId),
    metaTitle: prefs.metaTitle,
    metaDescription: prefs.metaDescription,
    ogImageUrl: prefs.ogImageUrl,
  });

  const runFix = (fix: ConversionFix) => {
    if (fix.kind === "add_booking") onAddKind("booking_request");
    else if (fix.kind === "add_vcard") onAddKind("vcard");
    else if (fix.kind === "highlight_cta") {
      const first = blocks.find((b) => !b.hidden);
      if (first) {
        onPrefChange("ctaBlockId", first.id);
        onPrefChange("ctaEffect", "glow");
      }
    } else {
      document.getElementById("coach-meta-title")?.scrollIntoView({ behavior: "smooth" });
      document.getElementById("coach-meta-title")?.focus();
    }
  };

  return (
    <AccordionItem
      value="conversion_tips"
      className="rounded-2xl border border-border bg-card px-4 sm:px-5"
    >
      <AccordionTrigger className="hover:no-underline">
        <span className="flex flex-1 items-center justify-between gap-3 pr-2">
          <span className="text-base font-medium">💡 Conversie Coach &amp; Optimalisatie</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            {checklist.percent}%
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-5 pb-5">
        <section className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">{audit.label}</span>
            <span className="text-muted-foreground">{checklist.percent}% voltooid</span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={checklist.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Conversiescore"
          >
            <div
              className={"h-full bg-primary transition-all"}
              style={{ width: `${checklist.percent}%` }}
            />
          </div>
        </section>

        <ul className="space-y-1.5" aria-label="Checklist">
          {checklist.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-xs">
              <span aria-hidden className={c.ok ? "text-primary" : "text-muted-foreground"}>{c.ok ? "✓" : "○"}</span>
              <span className={c.ok ? "text-muted-foreground line-through" : ""}>{c.advice}</span>
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">+{c.weight}</span>
            </li>
          ))}
        </ul>

        {audit.fixes.length > 0 && (
          <section className="space-y-2">
            <p className="text-xs font-medium">Snelle verbeteringen</p>
            {audit.fixes.map((fix) => (
              <div
                key={fix.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
              >
                <span className="text-xs">{fix.title}</span>
                <button
                  type="button"
                  onClick={() => runFix(fix)}
                  className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-muted"
                >
                  {fix.action}
                </button>
              </div>
            ))}
          </section>
        )}

        <section className="space-y-2">
          <p className="text-xs font-medium">Accentueer je belangrijkste link</p>
          <select
            className="input-field h-9 w-full rounded-xl border border-border bg-background px-2 text-xs"
            aria-label="Link met accent"
            value={prefs.ctaBlockId ?? ""}
            onChange={(e) => onPrefChange("ctaBlockId", e.target.value || null)}
          >
            <option value="">Geen link gekozen</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label || b.kind}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-4 gap-1.5">
            {CTA_EFFECTS.map((effect) => (
              <button
                key={effect.id}
                type="button"
                aria-pressed={prefs.ctaEffect === effect.id}
                onClick={() => onPrefChange("ctaEffect", effect.id)}
                className={cn(
                  "rounded-lg border px-2 py-1 text-[11px]",
                  prefs.ctaEffect === effect.id
                    ? "border-foreground bg-muted font-medium"
                    : "border-border hover:bg-muted",
                )}
              >
                {effect.label}
              </button>
            ))}
          </div>
        </section>

        <ConversionCoach blocks={blocks} />
      </AccordionContent>
    </AccordionItem>
  );
}
