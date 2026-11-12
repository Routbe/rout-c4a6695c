import { getMySnapchat } from "@/lib/snapchat.functions";
import { SnapchatPanel } from "./SnapchatPanel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BadgeCheck, ChevronDown, Plus, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { BrandIcon } from "@/components/integrations/BrandIcon";
import { integrationById } from "@/lib/integrations-catalog";
import { LIVE_CAPABLE_PROVIDERS, liveConnectionCount } from "@/lib/live-presence-rules";
import { getMyIntegrations, removeIntegration, saveIntegration } from "@/lib/integrations.functions";
import { disconnectSpotifyPresence, getMyPresence, setSpotifyPresenceScope, testSpotifyPresence } from "@/lib/presence.functions";
import { getReachSettings, syncFollowersNow, updateReachSettings } from "@/lib/total-reach.functions";
import { accountReach, countsTowardsReach, followerLabel, formatReach, relativeTimeNl, type ReachSettings } from "@/lib/total-reach";
import { ProfileScope } from "@/components/studio/IntegrationVault";
import { AddLiveIntegrationModal } from "@/components/studio/AddLiveIntegrationModal";
import type { BioProvider } from "@/lib/open-web-rules";
import { VerifyOwnership } from "@/components/studio/VerifyOwnership";
import { OfficialVerifyButton, hasOfficialVerify } from "@/components/studio/OfficialVerifyButton";
import { isBioVerifiable } from "@/lib/open-web-rules";
import { CustomPresencePanel } from "@/components/studio/CustomPresencePanel";
import { i18n as trI18n } from "@/lib/i18n";

/** Telt de actieve live diensten (Spotify + kluisrijen met live data). */
export function useLiveIntegrationCount(): number {
  const fetchPresence = useServerFn(getMyPresence);
  const fetchMine = useServerFn(getMyIntegrations);
  const fetchSnap = useServerFn(getMySnapchat);
  const snapchat = useQuery({ queryKey: ["my-snapchat"], queryFn: () => fetchSnap(), retry: false });
  const presence = useQuery({ queryKey: ["my-presence"], queryFn: () => fetchPresence(), retry: false });
  const mine = useQuery({ queryKey: ["my-integrations"], queryFn: () => fetchMine(), retry: false });
  const spotify = presence.data?.connections.some((c) => c.provider === "spotify") ? 1 : 0;
  const rows = (mine.data?.ready ? mine.data.items : []).filter((r) => LIVE_CAPABLE_PROVIDERS.includes(r.provider));
  return liveConnectionCount(Boolean(spotify), rows.map((r) => r.provider), Boolean(snapchat.data?.snap));
}

function scopeBadge(verified: boolean, alias: boolean): string {
  if (verified && alias) return "Beide profielen";
  if (verified) return "Geverifieerd profiel";
  if (alias) return "Privacy Alias";
  return "Verborgen";
}

/** Ingeklapte rij: logo, naam, account, badge en uitklapknop. */
function Row({ icon, label, account, verified, badge, children }: {
  icon: string | null; label: string; account: string; verified?: boolean; badge: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-w-0 items-center gap-2 p-3 text-left"
      >
        <BrandIcon icon={icon} />
        <span className="min-w-0 max-w-[45%] truncate text-sm font-medium">{label}</span>
        {verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Geverifieerd" />}
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{account}</span>
        <span className="max-w-[7rem] shrink-0 truncate whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-[10px] leading-4 text-muted-foreground" title={badge}>{badge}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && <div className="space-y-2 border-t border-border p-3">{children}</div>}
    </div>
  );
}

const btn = "inline-flex h-8 flex-1 items-center justify-center rounded-lg border border-border text-xs font-medium hover:bg-muted disabled:opacity-50";

/** Bereik-beheer voor één gekoppelde dienst: aantal, meetellen-schakelaar en handmatige override. */
function ReachControl({ provider, settings, busy, onSaved }: {
  provider: string; settings: ReachSettings | undefined; busy: boolean;
  onSaved: (next: ReachSettings) => void;
}) {
  const save = useServerFn(updateReachSettings);
  const account = settings?.accounts.find((a) => a.provider === provider);
  const [draft, setDraft] = useState<string | null>(null);
  if (!settings || !account || !countsTowardsReach(provider)) return null;
  const label = integrationById(provider)?.label ?? provider;
  const noun = followerLabel(provider);

  const persist = async (patch: { includeInReach?: boolean; manualCount?: number | null }) => {
    try {
      onSaved(await save({ data: { accounts: [{ provider, ...patch }] } }));
    } catch {
      toast.error(trI18n.t("ui.f678834f2b"));
    }
  };

  return (
    <section className="space-y-2 rounded-lg border border-border p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          <strong className="text-foreground">{formatReach(accountReach(account))}</strong> {noun}
          {account.manualCount !== null
            ? " · handmatig"
            : account.auto
              ? ` · automatisch · ${relativeTimeNl(account.lastSyncedAt)}`
              : " · vul zelf in"}
        </p>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Meetellen
          <Switch
            aria-label={`${label} meetellen in totaal bereik`}
            checked={account.includeInReach}
            disabled={busy}
            onCheckedChange={(v) => void persist({ includeInReach: v })}
          />
        </label>
      </div>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Handmatig aantal ${noun} voor ${label}`}
        value={draft ?? (account.manualCount === null ? "" : String(account.manualCount))}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const raw = (draft ?? "").trim();
          setDraft(null);
          const manualCount = raw === "" ? null : Math.max(0, Number.parseInt(raw, 10) || 0);
          if (manualCount !== account.manualCount) void persist({ manualCount });
        }}
        placeholder={account.auto ? `Handmatig aantal (overschrijft automatisch)` : `Aantal ${noun}`}
      />
    </section>
  );
}

/**
 * ⚡ Live Integraties: gekoppelde diensten met live data, standaard ingeklapt.
 * Opengeklapt: per profiel tonen, verifiëren, bereik beheren, testen (Spotify) en ontkoppelen.
 */
export function LiveIntegrations() {
  const qc = useQueryClient();
  const fetchPresence = useServerFn(getMyPresence);
  const fetchMine = useServerFn(getMyIntegrations);
  const fetchSnap = useServerFn(getMySnapchat);
  const snapchat = useQuery({ queryKey: ["my-snapchat"], queryFn: () => fetchSnap(), retry: false });
  const fetchReach = useServerFn(getReachSettings);
  const save = useServerFn(saveIntegration);
  const remove = useServerFn(removeIntegration);
  const setScope = useServerFn(setSpotifyPresenceScope);
  const testSpotify = useServerFn(testSpotifyPresence);
  const unlinkSpotify = useServerFn(disconnectSpotifyPresence);
  const presence = useQuery({ queryKey: ["my-presence"], queryFn: () => fetchPresence(), retry: false });
  const mine = useQuery({ queryKey: ["my-integrations"], queryFn: () => fetchMine(), retry: false });
  const reach = useQuery({ queryKey: ["reach-settings"], queryFn: () => fetchReach(), retry: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const spotify = presence.data?.connections.find((c) => c.provider === "spotify");
  const rows = (mine.data?.ready ? mine.data.items : []).filter((r) => LIVE_CAPABLE_PROVIDERS.includes(r.provider));

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
    } catch {
      toast.error(trI18n.t("ui.f678834f2b"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Live kaarten verschijnen alleen bij recent gebruik: Spotify tijdens het afspelen; GitHub, GitLab, Mastodon, Bluesky en wsocial.eu bij activiteit in de laatste 24 uur.
      </p>
      {!spotify && !snapchat.data?.snap && rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
          Nog geen live diensten gekoppeld.
        </p>
      )}
      {spotify && (
        <Row icon="siSpotify" label="Spotify" account={spotify.accountName ?? "Gekoppeld"} badge={scopeBadge(spotify.showOnVerified, spotify.showOnAlias)}>
          <ProfileScope
            label="Spotify"
            verified={spotify.showOnVerified}
            alias={spotify.showOnAlias}
            disabled={busy === "spotify"}
            onChange={(v) => void run("spotify", async () => {
              await setScope({ data: v });
              await qc.invalidateQueries({ queryKey: ["my-presence"] });
            })}
          />
          <div className="flex gap-2">
            <button type="button" disabled={busy === "spotify"} className={btn}
              onClick={() => void run("spotify", async () => {
                const r = await testSpotify();
                (r.ok ? toast.success : toast.error)(r.message, { duration: 10000 });
              })}>
              Test verbinding
            </button>
            <button type="button" disabled={busy === "spotify"} className={`${btn} text-destructive`}
              onClick={() => void run("spotify", async () => {
                await unlinkSpotify();
                await qc.invalidateQueries({ queryKey: ["my-presence"] });
                toast.success(trI18n.t("ui.28735e78d9"));
              })}>
              Ontkoppelen
            </button>
          </div>
        </Row>
      )}
      {snapchat.data?.snap && (
        <Row icon="siSnapchat" label="Snapchat" account={snapchat.data.snap.displayName ?? "Snapchat"} badge={snapchat.data.snap.showCard ? "Zichtbaar" : "Verborgen"}>
          <SnapchatPanel />
        </Row>
      )}
      {rows.map((row) => {
        const item = integrationById(row.provider);
        if (!item) return null;
        return (
          <Row key={row.provider} icon={item.icon} label={item.label} account={`@${row.handle.replace(/^@/, "")}`}
            verified={row.verified} badge={scopeBadge(row.showOnVerified, row.showOnAlias)}>
            <ProfileScope
              label={item.label}
              verified={row.showOnVerified}
              alias={row.showOnAlias}
              disabled={busy === row.provider}
              onChange={(v) => void run(row.provider, async () => {
                await save({ data: { provider: row.provider, handle: row.handle, audience: row.audience, visible: row.visible, useSso: row.verified, showOnVerified: v.verified, showOnAlias: v.alias } });
                await qc.invalidateQueries({ queryKey: ["my-integrations"] });
              })}
            />
            <ReachControl
              provider={row.provider}
              settings={reach.data}
              busy={busy === row.provider}
              onSaved={(next) => qc.setQueryData(["reach-settings"], next)}
            />
            {!row.verified && hasOfficialVerify(row.provider) && (
              <OfficialVerifyButton provider={row.provider} handle={row.handle} label={item.label} />
            )}
            {!row.verified && isBioVerifiable(row.provider) && (
              <VerifyOwnership
                provider={row.provider as BioProvider}
                label={item.label}
                onVerified={() => void qc.invalidateQueries({ queryKey: ["my-integrations"] })}
              />
            )}
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[11px] text-muted-foreground">
                {row.verified ? (
                  <>
                    <span className="font-medium text-primary">✓</span>{" "}
                    Geverifieerd{row.verifiedAt ? ` op ${new Date(row.verifiedAt).toLocaleDateString("nl-BE", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                    {" via "}{row.verificationMethod === "bio_scrape" ? "Bio-link" : "Platform Login"}
                  </>
                ) : "Status: Handmatig"}
              </span>
              <button type="button" disabled={busy === row.provider} className={`${btn} flex-none px-3 text-destructive`}
                onClick={() => void run(row.provider, async () => {
                  await remove({ data: { provider: row.provider } });
                  await qc.invalidateQueries({ queryKey: ["my-integrations"] });
                  await qc.invalidateQueries({ queryKey: ["reach-settings"] });
                  toast.success(`${item.label} ontkoppeld`);
                })}>
                Ontkoppelen
              </button>
            </div>
          </Row>
        );
      })}
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-medium transition-colors hover:bg-muted"
      >
        <Plus className="h-4 w-4" aria-hidden /> Live integratie toevoegen
      </button>
      <AddLiveIntegrationModal open={adding} onClose={() => setAdding(false)} />
      <CustomPresencePanel />
    </div>
  );
}

/** Compacte schakelaar voor het totale bereik, met huidig totaal en sync-knop. */
export function TotalReachToggle() {
  const qc = useQueryClient();
  const fetchReach = useServerFn(getReachSettings);
  const save = useServerFn(updateReachSettings);
  const sync = useServerFn(syncFollowersNow);
  const reach = useQuery({ queryKey: ["reach-settings"], queryFn: () => fetchReach(), retry: false });
  const [busy, setBusy] = useState(false);
  const settings = reach.data;

  const persist = async (fn: () => Promise<ReachSettings>, ok: string) => {
    setBusy(true);
    try {
      const next = await fn();
      qc.setQueryData(["reach-settings"], next);
      toast.success(ok);
    } catch {
      toast.error(trI18n.t("ui.f678834f2b"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Toon totaal bereik op mijn profiel</p>
          <p className="text-sm text-muted-foreground">
            Huidig totaal: <strong>{formatReach(settings?.totalReachCount ?? 0)}</strong>
            {settings?.lastSyncedAt ? ` · ${relativeTimeNl(settings.lastSyncedAt)}` : ""}
          </p>
        </div>
        <Switch
          aria-label="Toon totaal bereik op mijn profiel"
          checked={settings?.showTotalReach ?? false}
          disabled={busy || !settings}
          onCheckedChange={(v) => void persist(() => save({ data: { showTotalReach: v } }), "Opgeslagen")}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Per koppeling stel je het aantal in bij ⚡ Live Integraties hierboven.
        </p>
        <button
          type="button"
          disabled={busy || !settings}
          onClick={() => void persist(() => sync(), "Volgeraantallen bijgewerkt")}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden /> Nu synchroniseren
        </button>
      </div>
    </div>
  );
}
