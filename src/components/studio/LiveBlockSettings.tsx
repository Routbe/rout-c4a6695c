import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getMyIntegrations, removeIntegration, saveIntegration } from "@/lib/integrations.functions";
import { integrationById, LIVE_STAT_LABELS, liveStatOptions, shownLiveStats } from "@/lib/integrations-catalog";
import { OfficialVerifyButton, hasOfficialVerify } from "@/components/studio/OfficialVerifyButton";
import type { BioProvider } from "@/lib/open-web-rules";
import { VerifyOwnership } from "@/components/studio/VerifyOwnership";
import { isBioVerifiable } from "@/lib/open-web-rules";
import { i18n as trI18n } from "@/lib/i18n";

const btn = "inline-flex h-8 items-center justify-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50";

/**
 * Expanded settings of a live component (block kind "live", value = provider):
 * username link first, then official verify / disconnect, plus per-platform stat switches.
 */
export function LiveBlockSettings({ provider, stats, onStatsChange }: {
  provider: string;
  stats: string[] | undefined;
  onStatsChange: (next: string[]) => void;
}) {
  const qc = useQueryClient();
  const fetchMine = useServerFn(getMyIntegrations);
  const save = useServerFn(saveIntegration);
  const remove = useServerFn(removeIntegration);
  const mine = useQuery({ queryKey: ["my-integrations"], queryFn: () => fetchMine(), retry: false });
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const meta = integrationById(provider);
  const label = meta?.label ?? provider;
  const row = (mine.data?.ready ? mine.data.items : []).find((r) => r.provider === provider);
  const options = liveStatOptions(provider);
  const shown = shownLiveStats(provider, stats);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["my-integrations"] });
      toast.success(ok);
    } catch {
      toast.error(trI18n.t("ui.f678834f2b"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {!row ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const h = handle.trim().replace(/^@/, "");
            if (!h) return;
            void run(async () => {
              const r = await save({ data: { provider, handle: h, audience: "both", visible: true, useSso: false } });
              if (!r.ok) throw new Error();
            }, `${label} gekoppeld met gebruikersnaam`);
          }}
        >
          <Input aria-label={`${label} gebruikersnaam`} placeholder="gebruikersnaam" value={handle} onChange={(e) => setHandle(e.target.value)} />
          <button type="submit" disabled={busy || !handle.trim()} className={btn}>{trI18n.t("ui.1f9b7663b7")}</button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1 text-[11px] text-muted-foreground">
            @{row.handle.replace(/^@/, "")} · {row.verified ? "Officieel gekoppeld ✅" : "Via gebruikersnaam"}
          </span>
          <button
            type="button"
            disabled={busy}
            className={`${btn} text-destructive`}
            onClick={() => void run(() => remove({ data: { provider } }), `${label} ontkoppeld`)}
          >
            Ontkoppelen
          </button>
        </div>
      )}
      {row && !row.verified && hasOfficialVerify(provider) && (
        <OfficialVerifyButton provider={provider} handle={row.handle} label={label} />
      )}
      {row && !row.verified && isBioVerifiable(provider) && (
        <VerifyOwnership
          provider={provider as BioProvider}
          label={label}
          onVerified={() => void qc.invalidateQueries({ queryKey: ["my-integrations"] })}
        />
      )}
      {options.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-border p-2.5">
          <p className="text-[11px] font-medium text-muted-foreground">Toon op je profiel</p>
          {options.map((k) => (
            <label key={k} className="flex items-center justify-between gap-2 text-xs">
              {LIVE_STAT_LABELS[k]}
              <Switch
                checked={shown.has(k)}
                onCheckedChange={(on) => {
                  const next = new Set(shown);
                  if (on) next.add(k);
                  else next.delete(k);
                  onStatsChange(options.filter((o) => next.has(o)));
                }}
                aria-label={`${LIVE_STAT_LABELS[k]} tonen`}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
