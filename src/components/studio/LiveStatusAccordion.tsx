import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { StudioSectionIcon } from "./StudioSectionIcon";
import { useSnapchatCallback } from "./SnapchatPanel";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { StatusContentSettings } from "@/components/dashboard/editor/StatusSettings";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { LiveIntegrations, useLiveIntegrationCount } from "@/components/studio/LiveIntegrations";
import type { ProfileDisplayPrefs } from "@/lib/profile-display";
import { Switch } from "@/components/ui/switch";
import { PresenceComposer } from "@/components/qa/PresenceComposer";
import { ActivePulses } from "@/components/presence/ActivePulses";
import type { ProfileBlock } from "@/lib/profile";
import type { ReactNode } from "react";

type SetPref = <K extends keyof ProfileDisplayPrefs>(key: K, value: ProfileDisplayPrefs[K]) => void;

type Composer = { owner: string; handle: string; space: "root" | "alias"; blocks: ProfileBlock[] };

function PresenceBlock({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border p-4">
      <div><h3 className="text-xs font-semibold uppercase tracking-wider">{title}</h3><p className="text-xs text-muted-foreground">{help}</p></div>
      {children}
    </section>
  );
}

/** Live Presence: three blocks — Indicator (dot), Bericht (bubble), Pulse (24-hour ring + posts). */
export function LiveStatusAccordion({ prefs, setPref, composer }: { prefs: ProfileDisplayPrefs; setPref: SetPref; composer?: Composer | null }) {
  const { t } = useI18n();
  useSnapchatCallback();
  return (
    <AccordionItem value="live_status" className="acrylic-card px-4 sm:px-5">
      <AccordionTrigger className="hover:no-underline">
        <span className="flex flex-1 items-center justify-between gap-3 pr-2">
          <span className="flex min-w-0 items-center gap-2 text-base font-medium"><StudioSectionIcon kind="live" />{t("studio.live.title").replace(/^\p{Extended_Pictographic}\s*/u, "")}</span>
          {prefs.statusLine && (
            <span className="max-w-[45%] truncate rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              {prefs.statusLine}
            </span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent className="pb-5">
        <div className="space-y-3">
          <PresenceBlock title={t("studio.live.indicator")} help={t("studio.live.indicatorHelp")}>
            <StatusContentSettings prefs={prefs} setPref={setPref} bare part="indicator" />
          </PresenceBlock>
          <PresenceBlock title={t("studio.live.message")} help={t("studio.live.messageHelp")}>
            <StatusContentSettings prefs={prefs} setPref={setPref} bare part="message" />
          </PresenceBlock>
          <PresenceBlock title={t("studio.live.pulse")} help={t("studio.live.pulseHelp")}>
            <div className="flex items-center justify-between gap-4">
              <p className="min-w-0 flex-1 break-words text-sm font-medium">{t("studio.live.pulseRing")}</p>
              <div className="shrink-0"><Switch aria-label={t("studio.live.pulseRing")} checked={prefs.pulseRing} onCheckedChange={(value) => setPref("pulseRing", value)} /></div>
            </div>
            {composer && <><PresenceComposer {...composer} variant="default" /><ActivePulses handle={composer.handle} /></>}
          </PresenceBlock>
        </div>
        <LiveIntegrationsPanel prefs={prefs} setPref={setPref} />
      </AccordionContent>
    </AccordionItem>
  );
}

/** ⚡ Live Integraties als eigen inklapbaar sub-paneel. */
function LiveIntegrationsPanel({ prefs, setPref }: { prefs: ProfileDisplayPrefs; setPref: SetPref }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const count = useLiveIntegrationCount();
  return (
    <section className="mt-5 border-t border-border pt-4">
      <Button variant="outline"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 text-left text-sm font-medium hover:bg-muted"
      >
        <span>{t("studio.live.count", { count })}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </Button>
      {open && <div className="mt-3 space-y-3">
        {([['steamPresence', 'studio.effects.steam', 'studio.effects.steamHelp'], ['lastfmPresence', 'studio.effects.lastfm', 'studio.effects.lastfmHelp']] as const).map(([key, title, help]) => (
          <div key={key} className="flex items-start justify-between gap-4 rounded-xl border border-border p-3">
            <div className="min-w-0 flex-1 break-words"><p className="text-sm font-medium">{t(title)}</p><p className="text-xs text-muted-foreground">{t(help)}</p></div>
            <div className="shrink-0"><Switch aria-label={t(title)} checked={prefs[key]} onCheckedChange={(value) => setPref(key, value)} /></div>
          </div>
        ))}
        <LiveIntegrations />
      </div>}
    </section>
  );
}
