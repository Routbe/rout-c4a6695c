import { useEffect, useMemo, useState } from "react";
import { BroadcastSettings } from "./BroadcastSettings";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BadgeCheck, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { BrandIcon } from "@/components/integrations/BrandIcon";
import {
  INTEGRATION_FILTERS,
  filterIntegrations,
  isLive,
  type Integration,
  type IntegrationFilter,
} from "@/lib/integrations-catalog";
import { normalizeIntegrationValue, type Audience } from "@/lib/integrations-rules";
import { disconnectSpotifyPresence, setSpotifyPresenceScope, getMyPresence, setSpotifyPresenceVisible, testSpotifyPresence } from "@/lib/presence.functions";
import { SnapchatPanel } from "@/components/studio/SnapchatPanel";
import { getMyIntegrations, removeIntegration, saveIntegration } from "@/lib/integrations.functions";
import type { BioProvider } from "@/lib/open-web-rules";
import { VerifyOwnership } from "@/components/studio/VerifyOwnership";
import { OfficialVerifyButton, hasOfficialVerify } from "@/components/studio/OfficialVerifyButton";
import { isBioVerifiable } from "@/lib/open-web-rules";
import { i18n as trI18n } from "@/lib/i18n";

const SPOTIFY_MESSAGES: Record<string, [ok: boolean, text: string]> = {
  connected: [true, "Spotify gekoppeld"],
  cancelled: [false, "Koppelen geannuleerd"],
  not_configured: [false, "Spotify is nog niet ingesteld op ROUT"],
  invalid_state: [false, "Koppellink verlopen — probeer opnieuw"],
  failed: [false, "Spotify koppelen mislukt"],
};

const AUDIENCE_LABEL: Record<Audience, string> = { pro: "Pro", social: "Social", both: "Beide" };

function AudiencePicker({ value, onChange, disabled }: { value: Audience; onChange: (a: Audience) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Toon op profiel" className="grid grid-cols-3 gap-1 rounded-lg border border-border p-0.5">
      {(["pro", "social", "both"] as Audience[]).map((a) => (
        <button
          key={a}
          type="button"
          role="radio"
          aria-checked={value === a}
          disabled={disabled}
          onClick={() => onChange(a)}
          className={cn(
            "h-6 rounded-md text-[10px] font-medium transition-colors",
            value === a ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {AUDIENCE_LABEL[a]}
        </button>
      ))}
    </div>
  );
}

/**
 * 🔐 Integratiekluis (account-niveau): elke dienst wordt hier één keer gekoppeld en
 * geverifieerd, en daarna hergebruikt op elk profiel en in elk component.
 * `focus` toont meteen één dienst (vanuit de componentcatalogus).
 */
export function IntegrationVault({ focus }: { focus?: string } = {}) {
  const [filter, setFilter] = useState<IntegrationFilter>("popular");
  const [focused, setFocused] = useState<string | undefined>(focus);
  useEffect(() => setFocused(focus), [focus]);
  const qc = useQueryClient();
  const fetchPresence = useServerFn(getMyPresence);
  const setVisible = useServerFn(setSpotifyPresenceVisible);
  const disconnect = useServerFn(disconnectSpotifyPresence);
  const setScope = useServerFn(setSpotifyPresenceScope);
  const testSpotify = useServerFn(testSpotifyPresence);
  const fetchMine = useServerFn(getMyIntegrations);
  const save = useServerFn(saveIntegration);
  const remove = useServerFn(removeIntegration);

  const presence = useQuery({ queryKey: ["my-presence"], queryFn: () => fetchPresence(), retry: false });
  const mine = useQuery({ queryKey: ["my-integrations"], queryFn: () => fetchMine(), retry: false });
  const spotify = presence.data?.connections.find((c) => c.provider === "spotify");
  const saved = useMemo(() => new Map((mine.data?.items ?? []).map((i) => [i.provider, i])), [mine.data]);
  const sso = mine.data?.sso ?? {};

  const [open, setOpen] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [audience, setAudience] = useState<Audience>("both");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const flag = url.searchParams.get("spotify");
    if (!flag) return;
    const m = SPOTIFY_MESSAGES[flag];
    if (m) (m[0] ? toast.success : toast.error)(m[1]);
    url.searchParams.delete("spotify");
    window.history.replaceState(null, "", url.toString());
  }, []);

  const refresh = () => qc.invalidateQueries({ queryKey: ["my-integrations"] });

  // Back from an official sign-in: a matching linked account marks the saved handle as verified (server re-checks).
  useEffect(() => {
    for (const [provider, row] of saved) {
      const proven = sso[provider];
      if (row.verified || !proven) continue;
      if (proven.replace(/^@/, "").toLowerCase() !== row.handle.replace(/^@/, "").toLowerCase()) continue;
      void save({ data: { provider, audience: row.audience, visible: row.visible, useSso: true } }).then((r) => {
        if (r.ok) { toast.success(trI18n.t("ui.a6d062a75b")); void refresh(); }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, sso]);

  const persist = async (item: Integration, opts: { handle?: string; audience: Audience; visible: boolean; useSso?: boolean; showOnVerified?: boolean; showOnAlias?: boolean }) => {
    if (mine.data && !mine.data.ready) {
      toast.error(trI18n.t("ui.b3560735d4"), { description: "De tabel voor koppelingen bestaat nog niet." });
      return false;
    }
    setBusy(item.id);
    try {
      const r = await save({ data: { provider: item.id, ...opts } });
      if (!r.ok) {
        toast.error(r.error === "invalid_value" ? `Dit is geen geldige ${item.mode === "address" ? "adres" : "gebruikersnaam"}` : "Opslaan mislukt");
        return false;
      }
      await refresh();
      return true;
    } catch {
      toast.error(trI18n.t("ui.f678834f2b"));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const onPrimary = async (item: Integration) => {
    if (!isLive(item)) {
      toast(`${item.label} komt eraan`, { description: "Deze koppeling is in ontwikkeling." });
      return;
    }
    if (item.mode === "oauth") {
      if (presence.data && !presence.data.spotifyReady) return void toast.error(trI18n.t("ui.18bc76a523"));
      window.location.href = "/api/spotify/start";
      return;
    }
    if (sso[item.id]) {
      if (await persist(item, { audience: "both", visible: true, useSso: true })) toast.success(`${item.label} geactiveerd`);
      return;
    }
    setOpen(open === item.id ? null : item.id);
    setValue("");
    setAudience("both");
  };

  const submit = async (item: Integration) => {
    if (!normalizeIntegrationValue(item.id, value)) {
      toast.error(item.mode === "address" ? "Dit adres herkennen we niet" : "Deze gebruikersnaam klopt niet");
      return;
    }
    if (await persist(item, { handle: value, audience, visible: true })) {
      toast.success(`${item.label} gekoppeld`);
      setOpen(null);
    }
  };

  const unlink = async (item: Integration) => {
    setBusy(item.id);
    try {
      if (item.mode === "oauth") {
        await disconnect();
        await qc.invalidateQueries({ queryKey: ["my-presence"] });
      } else {
        await remove({ data: { provider: item.id } });
        await refresh();
      }
      toast.success(`${item.label} ontkoppeld`);
    } finally {
      setBusy(null);
    }
  };

  const connectedCount = (spotify ? 1 : 0) + saved.size;

  return (
    <div className="space-y-4">
        <BroadcastSettings />
        <p className="text-sm text-muted-foreground">
          Koppel en verifieer een dienst één keer. Daarna gebruik je hem op elk profiel en in elk component, zonder opnieuw te verifiëren.
          {connectedCount > 0 && <> · <strong>{connectedCount} gekoppeld</strong></>}
        </p>
        {(!focused || focused === "snapchat") && <SnapchatPanel />}
        {focused ? (
          <button type="button" onClick={() => setFocused(undefined)} className="text-xs font-medium text-muted-foreground underline underline-offset-2">Toon alle diensten</button>
        ) : (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Categorie">
          {INTEGRATION_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors",
                filter === f.id ? "border-primary/50 bg-primary/10" : "border-border hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        )}

        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:grid-cols-3">
          {(focused ? filterIntegrations("all").filter((i) => i.id === focused) : filterIntegrations(filter)).filter((item) => item.id !== "snapchat").map((item) => {
            const row = saved.get(item.id);
            const isSpotify = item.mode === "oauth";
            const connected = isSpotify ? Boolean(spotify) : Boolean(row);
            const live = isLive(item);
            const canActivate = !connected && Boolean(sso[item.id]);
            const status = connected
              ? isSpotify
                ? spotify?.accountName ?? "Gekoppeld"
                : row!.handle
              : canActivate
                ? `Ingelogd als ${sso[item.id]}`
                : live
                  ? "Beschikbaar"
                  : "Binnenkort";
            return (
              <div
                key={item.id}
                className={cn(
                  "flex min-w-0 flex-col gap-3 rounded-xl border p-3 transition-all",
                  connected ? "border-primary/50 bg-primary/5" : "border-border",
                  !live && "opacity-70",
                )}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                    <BrandIcon icon={item.icon} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 truncate text-sm font-medium">
                      <span className="truncate">{item.label}</span>
                      {row?.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Eigenaarschap geverifieerd" />}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">{status}</span>
                  </span>
                </div>

                {connected && isSpotify ? (
                  <div className="space-y-2">
                    <label className="flex items-center justify-between gap-2 text-[11px]">
                      <span>Toon op profiel</span>
                      <Switch
                        aria-label="Toon Spotify op profiel"
                        checked={spotify!.showOnProfile}
                        disabled={busy === item.id}
                        onCheckedChange={async (v) => {
                          setBusy(item.id);
                          try {
                            await setVisible({ data: { show: v } });
                            await qc.invalidateQueries({ queryKey: ["my-presence"] });
                          } finally {
                            setBusy(null);
                          }
                        }}
                      />
                    </label>
                    <ProfileScope
                      label={item.label}
                      verified={spotify!.showOnVerified}
                      alias={spotify!.showOnAlias}
                      disabled={busy === item.id}
                      onChange={async (v) => {
                        setBusy(item.id);
                        try {
                          await setScope({ data: v });
                          await qc.invalidateQueries({ queryKey: ["my-presence"] });
                        } finally {
                          setBusy(null);
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={busy === item.id}
                      onClick={async () => {
                        setBusy(item.id);
                        try {
                          const r = await testSpotify();
                          (r.ok ? toast.success : toast.error)(r.message, { duration: 10000 });
                        } catch {
                          toast.error(trI18n.t("ui.95bc20d760"));
                        } finally {
                          setBusy(null);
                        }
                      }}
                      className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-border text-xs font-medium hover:bg-muted"
                    >
                      Test verbinding
                    </button>
                    <button type="button" onClick={() => void unlink(item)} disabled={busy === item.id} className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-border text-xs font-medium hover:bg-muted">
                      Ontkoppelen
                    </button>
                  </div>
                ) : connected && row ? (
                  <div className="space-y-2">
                    <p className="truncate font-mono text-[11px] text-muted-foreground">Opgeslagen: {item.mode === "address" ? row.handle : `@${row.handle.replace(/^@/, "")}`}</p>
                    {!row.verified && hasOfficialVerify(item.id) && (
                      <OfficialVerifyButton provider={item.id} handle={row.handle} label={item.label} />
                    )}
                    {!row.verified && isBioVerifiable(item.id) && (
                      <VerifyOwnership provider={item.id as BioProvider} label={item.label} onVerified={() => void refresh()} />
                    )}
                    <AudiencePicker
                      value={row.audience}
                      disabled={busy === item.id}
                      onChange={(a) => void persist(item, { handle: row.handle, audience: a, visible: row.visible, useSso: row.verified })}
                    />
                    <label className="flex items-center justify-between gap-2 text-[11px]">
                      <span>Toon op profiel</span>
                      <Switch
                        aria-label={`Toon ${item.label} op profiel`}
                        checked={row.visible}
                        disabled={busy === item.id}
                        onCheckedChange={(v) => void persist(item, { handle: row.handle, audience: row.audience, visible: v, useSso: row.verified })}
                      />
                    </label>
                    <ProfileScope
                      label={item.label}
                      verified={row.showOnVerified}
                      alias={row.showOnAlias}
                      disabled={busy === item.id}
                      onChange={(v) => void persist(item, { handle: row.handle, audience: row.audience, visible: row.visible, useSso: row.verified, showOnVerified: v.verified, showOnAlias: v.alias })}
                    />
                    <button type="button" onClick={() => void unlink(item)} disabled={busy === item.id} className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-border text-xs font-medium hover:bg-muted">
                      Ontkoppelen
                    </button>
                  </div>
                ) : open === item.id ? (
                  <form
                    className="space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submit(item);
                    }}
                  >
                    <div className="flex h-8 items-center rounded-lg border border-border bg-background px-2">
                    {item.mode === "handle" && item.id !== "youtube" && <span className="text-xs text-muted-foreground" aria-hidden>@</span>}
                    <input
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder={item.placeholder}
                      aria-label={`${item.label} ${item.mode === "address" ? "adres" : "gebruikersnaam"}`}
                      className="h-full w-full min-w-0 bg-transparent px-1 text-xs outline-none"
                    />
                    {item.id === "wsocial" && value && !value.includes(".") && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">.wsocial.eu</span>}
                    </div>
                    {item.mode === "address" && (
                      <p className="text-[10px] text-muted-foreground">Alleen je publieke adres — nooit een sleutel of herstelzin.</p>
                    )}
                    <AudiencePicker value={audience} onChange={setAudience} />
                    <div className="flex gap-2">
                      <button type="submit" disabled={busy === item.id} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-foreground text-xs font-medium text-background">
                        {busy === item.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null} Opslaan
                      </button>
                      <button type="button" onClick={() => setOpen(null)} className="h-8 rounded-lg border border-border px-2 text-xs">
                        Annuleer
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onPrimary(item)}
                    disabled={busy === item.id}
                    className={cn(
                      "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-opacity",
                      live ? "bg-foreground text-background hover:opacity-90" : "border border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {busy === item.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                    {canActivate ? "Activeer" : live ? "Koppel" : "Binnenkort"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
    </div>
  );
}

/** Independent per-profile visibility: Verified profile and/or Privacy Alias. */
export function ProfileScope({ label, verified, alias, disabled, onChange }: {
  label: string; verified: boolean; alias: boolean; disabled?: boolean;
  onChange: (v: { verified: boolean; alias: boolean }) => void;
}) {
  return (
    <fieldset className="space-y-1 rounded-lg border border-border p-2 text-[11px]">
      <legend className="px-1 text-muted-foreground">Zichtbaar op</legend>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={verified} disabled={disabled} aria-label={`${label} op Geverifieerd profiel`}
          onChange={(e) => onChange({ verified: e.target.checked, alias })} className="h-3.5 w-3.5 accent-primary" />
        Toon op Geverifieerd profiel
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={alias} disabled={disabled} aria-label={`${label} op Privacy Alias`}
          onChange={(e) => onChange({ verified, alias: e.target.checked })} className="h-3.5 w-3.5 accent-primary" />
        Toon op Privacy Alias
      </label>
    </fieldset>
  );
}
