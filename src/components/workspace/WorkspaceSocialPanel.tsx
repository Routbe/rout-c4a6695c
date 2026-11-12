import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLATFORM_LABEL, SOCIAL_PLATFORMS, type SocialLinkDTO, type SocialPlatform } from "@/lib/social-verify";
import {
  getWorkspaceSocial,
  removeWorkspaceSocial,
  saveWorkspaceSocial,
  verifyWorkspaceSocialLink,
} from "@/lib/workspace-social.functions";
import { i18n as trI18n } from "@/lib/i18n";

/**
 * Claim Mastodon, Bluesky, … accounts for the workspace. Proof: the workspace
 * address (rout.be/w/<slug>) or its verified domain in the account's bio.
 */
export function WorkspaceSocialPanel({ workspaceId }: { workspaceId: string }) {
  const list = useServerFn(getWorkspaceSocial);
  const save = useServerFn(saveWorkspaceSocial);
  const remove = useServerFn(removeWorkspaceSocial);
  const verify = useServerFn(verifyWorkspaceSocialLink);
  const [links, setLinks] = useState<SocialLinkDTO[]>([]);
  const [slug, setSlug] = useState("");
  const [domain, setDomain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<SocialPlatform>("mastodon");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const r = await list({ data: { workspaceId } });
      setLinks(r.links);
      setSlug(r.slug);
      setDomain(r.domain);
    } catch {
      toast.error(trI18n.t("ui.618c56dfa2"));
    } finally {
      setLoading(false);
    }
  }, [list, workspaceId]);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    setBusy("new");
    const r = await save({ data: { workspaceId, platform, username } }).catch(() => null);
    setBusy(null);
    if (!r?.ok) return toast.error(trI18n.t("ui.84309d6dd2"));
    setUsername("");
    void load();
  }
  async function check(id: string) {
    setBusy(id);
    const r = await verify({ data: { workspaceId, id } }).catch(() => null);
    setBusy(null);
    if (r?.ok) toast.success(trI18n.t("ui.13f3c3c5f4"));
    else if (r?.reason === "link_missing") toast.error(trI18n.t("ui.c2db2c4217"));
    else toast.error(trI18n.t("ui.779b53f805"));
    void load();
  }
  async function del(id: string) {
    setBusy(id);
    await remove({ data: { workspaceId, id } }).catch(() => null);
    setBusy(null);
    void load();
  }

  const proofs = [`rout.be/w/${slug || "…"}`, ...(domain ? [domain] : [])];

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="space-y-1">
        <h2 className="text-base font-medium">Mastodon, Bluesky &amp; sociale accounts</h2>
        <p className="text-sm text-muted-foreground">
          Claim de accounts van je bedrijf. Zet <strong className="break-all">{proofs.join(" of ")}</strong> in de bio
          (bij Mastodon in een profielveld) en klik op Verifiëren.
        </p>
        {domain ? (
          <p className="text-sm text-muted-foreground">
            Bluesky-tip: gebruik <strong>{domain}</strong> als Bluesky-handle. Voeg bij je domeinbeheer een TXT-record
            <code className="mx-1 break-all rounded bg-muted px-1">_atproto.{domain}</code> toe met de waarde die Bluesky
            toont onder Instellingen → Handle wijzigen.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Een Bluesky-handle moet een domeinnaam zijn. Verifieer eerst je eigen domein hierboven om die als handle te gebruiken.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as SocialPlatform)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label="Platform"
        >
          {SOCIAL_PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
        </select>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={platform === "mastodon" ? "@bedrijf@mastodon.social" : platform === "bluesky" ? "bedrijf.be" : "gebruikersnaam"}
          className="h-9 min-w-0 sm:w-56"
        />
        <Button size="sm" onClick={add} disabled={busy === "new" || !username.trim() || !workspaceId}>
          {busy === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Toevoegen"}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : links.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nog geen accounts geclaimd.</p>
      ) : (
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-border p-3">
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">{PLATFORM_LABEL[l.platform]}</span> · {l.username}
              </span>
              {l.isVerified ? (
                <span className="inline-flex items-center gap-1 text-xs text-primary"><BadgeCheck className="h-4 w-4" />Geverifieerd</span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => check(l.id)} disabled={busy === l.id}>
                  {busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="mr-1 h-3.5 w-3.5" />Verifiëren</>}
                </Button>
              )}
              <Button size="icon" variant="ghost" aria-label="Verwijderen" onClick={() => del(l.id)} disabled={busy === l.id}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
