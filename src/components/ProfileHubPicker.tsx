import { useContext, useEffect, useState } from "react";
import { BadgeCheck, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/lib/router-compat";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { getStudioProfile } from "@/lib/studio-profile.functions";
import { getQrSettingsFn, getWorkspaceQrSettingsFn, saveQrSettingsFn, saveWorkspaceQrSettingsFn } from "@/lib/qr-settings.functions";
import { getWorkspaceContext, type WorkspaceSummary } from "@/lib/workspaces.functions";
import { getWorkspaceStudioProfile } from "@/lib/workspace-studio.functions";
import { canEditWorkspaceHub, workspacePublicPath } from "@/lib/workspace-rules";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProfileQrApplyContext, ProfileQrDesignContext } from "@/lib/qr-design-bridge";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { HANDLE_MIN_LENGTH, handleIssue, normalizeHandle, profilePath } from "@/lib/profile";
import { i18n as trI18n } from "@/lib/i18n";

interface Props {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

/**
 * The QR generator only picks the @handle the QR points to; "Opslaan" stores
 * the on-screen design as the profile QR style (shown in the Share menu).
 */
export function ProfileHubPicker({ values, onChange }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [handle, setHandle] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [manual, setManual] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const loadProfile = useServerFn(getStudioProfile);
  const saveQr = useServerFn(saveQrSettingsFn);
  const saveWsQr = useServerFn(saveWorkspaceQrSettingsFn);
  const loadWsContext = useServerFn(getWorkspaceContext);
  const loadWsProfile = useServerFn(getWorkspaceStudioProfile);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  /** "personal" or a workspace id: which profile the QR opens and saves to. */
  const [target, setTarget] = useState<string>("personal");
  const [wsPath, setWsPath] = useState<string | null>(null);
  const design = useContext(ProfileQrDesignContext);
  const applyStyle = useContext(ProfileQrApplyContext);
  const loadPersonalQr = useServerFn(getQrSettingsFn);
  const loadWsQr = useServerFn(getWorkspaceQrSettingsFn);
  const activeWs = workspaces.find((w) => w.id === target) ?? null;
  const queryClient = useQueryClient();

  useEffect(() => { setSaved(false); }, [design]);

  async function saveDesign() {
    if (!design || saving) return;
    setSaving(true);
    try {
      if (activeWs) await saveWsQr({ data: { workspaceId: activeWs.id, style: design } });
      else await saveQr({ data: design });
      await queryClient.invalidateQueries({ predicate: query => query.queryKey.some(key => typeof key === "string" && /profile|studio|draft/.test(key)) });
      setSaved(true);
      toast.success(trI18n.t("ui.f54132e830"));
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      toast.error(`Opslaan mislukt: ${err instanceof Error ? err.message : "onbekende fout"}`);
    } finally {
      setSaving(false);
    }
  }

  const origin = "https://rout.be";
  const host = origin.replace(/^https?:\/\//, "");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      let data: Awaited<ReturnType<typeof loadProfile>> = null;
      try {
        data = await loadProfile();
      } catch (error) {
        console.error("[hub-picker:load:failed]", error);
      }
      if (cancelled) return;
      let wsList: WorkspaceSummary[] = [];
      try {
        const ctx = await loadWsContext();
        if (ctx.available) wsList = ctx.workspaces;
      } catch (error) {
        console.error("[hub-picker:workspaces:failed]", error);
      }
      if (cancelled) return;
      setWorkspaces(wsList);
      const wanted = new URLSearchParams(window.location.search).get("workspace")?.toLowerCase();
      const preset = wanted ? wsList.find((w) => w.slug.toLowerCase() === wanted) : undefined;
      if (preset) {
        if (data?.username) { setHandle(data.username); setVerified(Boolean(data.verified) && data.status === "active"); }
        setLoading(false);
        void selectTarget(preset.id, wsList);
        return;
      }
      if (data?.username) {
        const isVerified = Boolean(data.verified) && data.status === "active";
        setHandle(data.username);
        setVerified(isVerified);
        onChange("hub_url", `${origin}${profilePath(data.username, isVerified)}`);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function selectTarget(id: string, list: WorkspaceSummary[] = workspaces) {
    setTarget(id);
    setSaved(false);
    const ws = list.find((w) => w.id === id);
    // Show the QR design saved for the chosen profile, so "Opslaan" edits that one.
    if (applyStyle) {
      void (ws ? loadWsQr({ data: { workspaceId: ws.id } }) : loadPersonalQr())
        .then((style) => { if (style) applyStyle(style); })
        .catch((error) => console.error("[hub-picker:qr-style:failed]", error));
    }
    if (!ws) {
      setWsPath(null);
      const h = handle ?? normalizeHandle(manual);
      onChange("hub_url", h ? `${origin}${profilePath(h, verified)}` : "");
      return;
    }
    const fallback = workspacePublicPath(ws.slug, null);
    setWsPath(fallback);
    onChange("hub_url", `${origin}${fallback}`);
    try {
      const p = await loadWsProfile({ data: { workspaceSlug: ws.slug } });
      const path = workspacePublicPath(p.workspaceSlug, { name: p.domain, verified: p.domainVerified });
      setWsPath(path);
      onChange("hub_url", `${origin}${path}`);
    } catch (error) {
      console.error("[hub-picker:workspace-profile:failed]", error);
    }
  }

  const setManualHandle = (raw: string) => {
    const h = normalizeHandle(raw);
    setManual(raw);
    setHandle(h || null);
    setVerified(false);
    onChange("hub_url", h ? `${origin}${profilePath(h, false)}` : "");
  };

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border border-border">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const shown = handle ?? normalizeHandle(manual);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div>
        <p className="text-sm font-medium text-foreground">Social Profile Hub</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Kies welke handle deze QR-code opent. Je profielinhoud beheer je in de Studio.
        </p>
      </div>

      {user && (
        <Select value={target} onValueChange={(v) => void selectTarget(v)}>
          <SelectTrigger className="h-11 rounded-xl" aria-label="Profiel voor deze QR-code">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="personal">Persoonlijk{handle ? ` · @${handle}` : ""}</SelectItem>
            {workspaces.map((w) => (
              <SelectItem key={w.id} value={w.id}>Workspace · {w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {!activeWs && (!user || !handle) && (
<>
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-[13px] text-muted-foreground">@</span>
        <Input
          className="input-field h-11 min-w-0 flex-1 rounded-xl"
          placeholder="jouwnaam"
          maxLength={30}
          minLength={HANDLE_MIN_LENGTH}
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={shown ? !!handleIssue(shown) : undefined}
          aria-describedby="hub-handle-help"
          value={manual || handle || ""}
          onChange={(e) => setManualHandle(e.target.value)}
          aria-label="ROUT handle"
        />
        {verified && <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
      </div>

      {shown && handleIssue(shown) && (
        <p id="hub-handle-help" role="status" className="text-[11px] text-muted-foreground">
          {handleIssue(shown)}
        </p>
      )}

</>
      )}

      {/* Doelprofiel: ruime padding zodat de tekst nergens afgesneden wordt. */}
      <div className="rounded-lg bg-muted/50 px-3 py-3 sm:px-4">
        <p className="break-all font-mono text-[13px] font-medium leading-relaxed text-foreground">
          {host}
          {activeWs ? wsPath ?? workspacePublicPath(activeWs.slug, null) : profilePath(shown || "jouwnaam", verified)}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Gratis profiel op rout.be. Custom domeinen beschikbaar op Pro.
          {!verified && <> Gratis profielen gebruiken de <strong>/u/</strong> namespace. Verifieer je account om je eigen unieke handle te claimen.</>}
        </p>
      </div>

      <Button
        type="button"
        onClick={() => void saveDesign()}
        disabled={saving || !user || !design || (activeWs ? !canEditWorkspaceHub(activeWs.role) : false)}
        className="min-h-12 w-full gap-2 rounded-lg text-sm"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
        {!user ? "Log in om op te slaan" : saved ? "Opgeslagen" : "Opslaan"}
      </Button>
      {activeWs && !canEditWorkspaceHub(activeWs.role) && (
        <p className="text-center text-[11px] text-muted-foreground">Je rol in deze workspace mag de QR-stijl niet opslaan.</p>
      )}
      <Link to={activeWs ? `/studio/w/${activeWs.slug}/studio` : "/studio"} className="block text-center text-[12px] text-muted-foreground underline-offset-4 hover:underline">
        Beheer profielhub →
      </Link>

      {values.hub_url && (
        <p className="break-all text-[11px] text-muted-foreground">Doel: {values.hub_url}</p>
      )}
    </div>
  );
}
