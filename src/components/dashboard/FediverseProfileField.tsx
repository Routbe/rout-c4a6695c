import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Check, Copy, Loader2, RefreshCw, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getMyFediverseProfile, getMyVerificationSetup, saveMyFediverseProfile } from "@/lib/fediverse-profile.functions";
import { joinMastodonHandle, mastodonProfileSchema, splitMastodonHandle } from "@/lib/fediverse-profile";

const SERVERS = ["mastodon.social", "mastodon-belgium.be", "mastodon.online", "mstdn.social", "fosstodon.org", "mas.to", "hachyderm.io"];

function CopyRow({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
      <code className="min-w-0 flex-1 truncate text-xs">{value}</code>
      <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={() => { void navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }}>
        {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{done ? "Gekopieerd" : "Kopieer"}
      </Button>
    </div>
  );
}

/** Mastodon + GitHub: claim your account and get the blue check for your ROUT address. */
export function FediverseProfileField() {
  const get = useServerFn(getMyFediverseProfile);
  const save = useServerFn(saveMyFediverseProfile);
  const setup = useServerFn(getMyVerificationSetup);
  const [user, setUser] = useState("");
  const [server, setServer] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [github, setGithub] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([get(), setup()])
      .then(([identity, s]) => {
        if (!active) return;
        // Saved account first; otherwise prefill from a Mastodon sign-in or claimed account.
        const parts = splitMastodonHandle(identity?.url ?? s.mastodonSuggestion);
        setUser(parts.user); setServer(parts.server);
        setVerified(identity?.verified ?? false);
        setUrls(s.urls); setGithub(s.github);
      })
      .catch(() => { if (active) setMessage("De koppeling is tijdelijk niet bereikbaar."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [get, setup]);

  async function submit() {
    const joined = joinMastodonHandle(user, server);
    if (!joined && (user || server)) { setMessage("Vul zowel je gebruikersnaam als je server in."); return; }
    const parsed = mastodonProfileSchema.safeParse(joined);
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Ongeldige Mastodon-handle."); return; }
    setBusy(true); setMessage("");
    try {
      const result = await save({ data: parsed.data });
      if (!result.ok) { setMessage(result.message); return; }
      const parts = splitMastodonHandle(result.identity?.url);
      setUser(parts.user); setServer(parts.server);
      setVerified(result.identity?.verified ?? false);
      setMessage(result.identity ? result.identity.verified ? "Mastodon-eigendom bevestigd." : "Opgeslagen. Voeg je ROUT-adres toe op Mastodon (stap 2) en klik opnieuw." : "Mastodon-koppeling verwijderd.");
    } catch { setMessage("De koppeling is tijdelijk niet bereikbaar."); }
    finally { setBusy(false); }
  }

  const profileUrl = user && server ? `https://${server}/@${user.replace(/^@/, "")}` : null;

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-sm font-medium">1. Je Mastodon-account</h3>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr]">
          <label className="space-y-1 text-xs text-muted-foreground">
            Gebruikersnaam
            <Input value={user} disabled={busy} placeholder="Maximilien" maxLength={60} onChange={(e) => { setUser(e.target.value.replace(/^@/, "")); setVerified(false); setMessage(""); }} />
          </label>
          <span className="hidden self-end pb-2 text-muted-foreground sm:block">@</span>
          <label className="space-y-1 text-xs text-muted-foreground">
            Server
            <Input value={server} disabled={busy} list="mastodon-servers" placeholder="mastodon-belgium.be" maxLength={120} onChange={(e) => { setServer(e.target.value); setVerified(false); setMessage(""); }} />
            <datalist id="mastodon-servers">{SERVERS.map((s) => <option key={s} value={s} />)}</datalist>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : verified || profileUrl ? <RefreshCw className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            Opslaan en controleren
          </Button>
          {verified && <span className="inline-flex items-center gap-1 text-sm text-primary"><BadgeCheck className="h-4 w-4" />Geverifieerd</span>}
        </div>
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">2. Blauw vinkje op Mastodon</h3>
        <p className="text-sm text-muted-foreground">
          De verborgen code die Mastodon vraagt (<code>rel="me"</code>) zet ROUT al automatisch op je pagina zodra je account hierboven is opgeslagen. Je hoeft niets in de code te plakken.
          Ga op Mastodon naar <strong>Profiel bewerken → Extra velden</strong> en plak één of meer van deze adressen als waarde. Stond het adres er al, verwijder het veld dan en voeg het opnieuw toe.
        </p>
        {urls.length ? urls.map((u) => <CopyRow key={u} value={u} />) : <p className="text-sm text-muted-foreground">Kies eerst een profielnaam om je adressen te zien.</p>}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">GitHub</h3>
        <p className="text-sm text-muted-foreground">
          Plak een van de adressen hierboven bij <strong>Website</strong> of <strong>Social accounts</strong> op je GitHub-profiel{github ? ` (@${github})` : ""}.
          GitHub geeft websites zelf geen blauw vinkje, maar markeert die link als van jou (<code>rel="me"</code>). Zo kunnen Mastodon en ROUT de koppeling bevestigen.
        </p>
      </section>
    </div>
  );
}
