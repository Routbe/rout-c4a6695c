import { withStepUp } from "@/components/auth/StepUpDialog";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Eye, EyeOff, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  consoleAccess,
  deleteOAuthClient,
  listOAuthClients,
  rotateOAuthSecret,
  saveOAuthClient,
} from "@/lib/oauth/console.functions";
import { findSharedRedirects } from "@/lib/oauth/shared-redirects";
import { i18n as trI18n } from "@/lib/i18n";

type ClientRow = {
  id: string;
  clientId: string;
  name: string;
  logoUrl: string | null;
  homepageUrl: string | null;
  privacyUrl: string | null;
  termsUrl: string | null;
  redirectUris: string[];
  postLogoutRedirectUris?: string[];
  scopes: string[];
  status: string;
  hasSecret: boolean;
  createdAt: string;
};

const SCOPES = [
  { id: "openid", label: "openid — bevestigt wie de gebruiker is (verplicht)" },
  { id: "profile", label: "profile — naam, handle en profielfoto" },
  { id: "email", label: "email — e-mailadres en of het bevestigd is" },
];

const empty = {
  id: undefined as string | undefined,
  name: "",
  logoUrl: "",
  homepageUrl: "",
  privacyUrl: "",
  termsUrl: "",
  redirectUris: "",
  postLogoutRedirectUris: "",
  scopes: ["openid", "profile"],
};

/** Google-Cloud-achtige console om "Login met ROUT"-apps te beheren. */
export function OAuthConsole() {
  const access = useServerFn(consoleAccess);
  const list = useServerFn(listOAuthClients);
  const save = useServerFn(saveOAuthClient);
  const remove = useServerFn(deleteOAuthClient);
  const rotate = useServerFn(rotateOAuthSecret);

  const [verified, setVerified] = useState<boolean | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const shared = findSharedRedirects(clients);
  const [form, setForm] = useState({ ...empty });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<{ clientId: string; value: string } | null>(null);
  const [revealed, setRevealed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setClients((await list()) as ClientRow[]);
    } catch {
      /* stil: toegang wordt apart gemeld */
    }
  }, [list]);

  const [checkFailed, setCheckFailed] = useState(false);
  const check = useCallback(() => {
    setCheckFailed(false);
    setVerified(null);
    access()
      .then(async (r) => {
        setVerified(r.verified);
        if (r.verified) await refresh();
      })
      .catch(() => {
        // A failed check is "unknown", never "not verified".
        setCheckFailed(true);
        setVerified(false);
      });
  }, [access, refresh]);

  useEffect(() => {
    check();
  }, [check]);

  if (verified === null) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  if (checkFailed) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-xl text-foreground">Login met ROUT</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We konden je toegang even niet controleren. Probeer het opnieuw.
        </p>
        <Button className="mt-4" variant="outline" onClick={check}>
          <RefreshCw className="mr-2 h-4 w-4" /> Opnieuw proberen
        </Button>
      </section>
    );
  }

  if (!verified) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6">
        <Badge variant="secondary">Alleen voor geverifieerde leden</Badge>
        <h2 className="mt-3 font-display text-xl text-foreground">Bouw soevereine apps met ROUT</h2>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
          Met de Developer Console maak je "Login met ROUT"-apps en API-sleutels. Om spam te
          voorkomen en het vertrouwen in het ecosysteem te bewaken, is dit voorbehouden aan
          geverifieerde accounts. Gebruikers zien zo altijd wie er achter een app zit.
        </p>
        <Button className="mt-4" asChild>
          <a href="/verify">Start verificatie</a>
        </Button>
      </section>
    );
  }

  function startNew() {
    setForm({ ...empty });
    setEditing(true);
    setSecret(null);
  }

  function startEdit(row: ClientRow) {
    setForm({
      id: row.id,
      name: row.name,
      logoUrl: row.logoUrl ?? "",
      homepageUrl: row.homepageUrl ?? "",
      privacyUrl: row.privacyUrl ?? "",
      termsUrl: row.termsUrl ?? "",
      redirectUris: row.redirectUris.join("\n"),
      postLogoutRedirectUris: (row.postLogoutRedirectUris ?? []).join("\n"),
      scopes: row.scopes,
    });
    setEditing(true);
    setSecret(null);
  }

  async function submit() {
    setBusy(true);
    try {
      const result = (await save({
        data: {
          ...(form.id ? { id: form.id } : {}),
          name: form.name.trim(),
          logoUrl: form.logoUrl.trim() || null,
          homepageUrl: form.homepageUrl.trim() || null,
          privacyUrl: form.privacyUrl.trim() || null,
          termsUrl: form.termsUrl.trim() || null,
          redirectUris: form.redirectUris
            .split("\n")
            .map((u) => u.trim())
            .filter(Boolean),
          postLogoutRedirectUris: form.postLogoutRedirectUris
            .split("\n")
            .map((u) => u.trim())
            .filter(Boolean),
          scopes: form.scopes,
        },
      })) as { client: ClientRow; clientSecret: string | null };
      toast.success(form.id ? "App bijgewerkt" : "App aangemaakt");
      if (result.clientSecret) {
        setSecret({ clientId: result.client.clientId, value: result.clientSecret });
        setRevealed(true);
      }
      setEditing(false);
      await refresh();
    } catch (error) {
      toast.error((error as Error).message || "Opslaan lukte niet");
    } finally {
      setBusy(false);
    }
  }

  async function onRotate(row: ClientRow) {
    setBusy(true);
    try {
      const result = (await withStepUp(() => rotate({ data: { id: row.id } }))) as { clientSecret: string };
      setSecret({ clientId: row.clientId, value: result.clientSecret });
      setRevealed(true);
      toast.success(trI18n.t("ui.e277863460"));
    } catch (error) {
      toast.error((error as Error).message || "Roteren lukte niet");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(row: ClientRow) {
    if (!window.confirm(`"${row.name}" definitief verwijderen?`)) return;
    await remove({ data: { id: row.id } });
    await refresh();
    toast.success(trI18n.t("ui.d7fe6d5ee2"));
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-foreground">Login met ROUT</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Registreer je app en laat mensen aanmelden met hun ROUT-identiteit (OAuth 2.1 / OIDC,
            met verplichte PKCE).
          </p>
        </div>
        <Button onClick={startNew} size="sm">
          <Plus className="h-4 w-4" /> Nieuwe app
        </Button>
      </div>

      {secret && (
        <div className="rounded-2xl border border-border bg-muted/40 p-4">
          <p className="text-sm font-medium text-foreground">
            Clientsecret voor {secret.clientId} — één keer zichtbaar
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs">
              {revealed ? secret.value : "•".repeat(32)}
            </code>
            <Button size="sm" variant="outline" onClick={() => setRevealed((v) => !v)}>
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(secret.value);
                toast.success(trI18n.t("ui.d0954ac4f4"));
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {editing && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <Tabs defaultValue="branding">
            <TabsList>
              <TabsTrigger value="branding">Branding</TabsTrigger>
              <TabsTrigger value="redirects">Terugkeeradressen</TabsTrigger>
              <TabsTrigger value="scopes">Scopes</TabsTrigger>
            </TabsList>

            <TabsContent value="branding" className="mt-4 space-y-3">
              <div>
                <Label htmlFor="oa-name">Naam van de app</Label>
                <Input
                  id="oa-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="oa-logo">Logo-URL</Label>
                <Input
                  id="oa-logo"
                  placeholder="https://…/logo.png"
                  value={form.logoUrl}
                  onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="oa-home">Website</Label>
                  <Input
                    id="oa-home"
                    value={form.homepageUrl}
                    onChange={(e) => setForm({ ...form, homepageUrl: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="oa-priv">Privacybeleid</Label>
                  <Input
                    id="oa-priv"
                    value={form.privacyUrl}
                    onChange={(e) => setForm({ ...form, privacyUrl: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="oa-terms">Voorwaarden</Label>
                  <Input
                    id="oa-terms"
                    value={form.termsUrl}
                    onChange={(e) => setForm({ ...form, termsUrl: e.target.value })}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="redirects" className="mt-4 space-y-2">
              <Label htmlFor="oa-uris">Toegestane terugkeeradressen — één per lijn</Label>
              <textarea
                id="oa-uris"
                rows={4}
                className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs"
                placeholder={"https://jouwapp.be/callback\nhttp://localhost:3000/callback"}
                value={form.redirectUris}
                onChange={(e) => setForm({ ...form, redirectUris: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Alleen https; http mag uitsluitend voor localhost tijdens ontwikkeling. Adressen
                worden letterlijk vergeleken.
              </p>
              <Label htmlFor="oa-logout-uris" className="pt-2">
                Adressen na uitloggen — één per lijn
              </Label>
              <textarea
                id="oa-logout-uris"
                rows={3}
                className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs"
                placeholder={"https://jouwapp.be/uitgelogd"}
                value={form.postLogoutRedirectUris}
                onChange={(e) => setForm({ ...form, postLogoutRedirectUris: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Na uitloggen via ROUT sturen we alleen terug naar deze adressen.
              </p>
            </TabsContent>

            <TabsContent value="scopes" className="mt-4 space-y-2">
              {SCOPES.map((scope) => (
                <label key={scope.id} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={form.scopes.includes(scope.id)}
                    disabled={scope.id === "openid"}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        scopes: e.target.checked
                          ? [...form.scopes, scope.id]
                          : form.scopes.filter((s) => s !== scope.id),
                      })
                    }
                  />
                  {scope.label}
                </label>
              ))}
              <div className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="mb-2 font-medium text-foreground">Dubbele accounts voorkomen</p>
                <pre className="whitespace-pre-wrap font-mono">{`// na de tokenruil: lees het id_token (Blind Hash Matching, scope accounts:merge)
let user = await db.findBy({ rout_sub: claims.sub });
// rout_matched_account staat er alleen als het lid zelf één account bevestigde
if (!user && claims.rout_matched_account) user = await db.findById(claims.rout_matched_account);
user ? await db.link(user, { rout_sub: claims.sub }) : await db.create(claims);`}</pre>
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-5 flex gap-2">
            <Button onClick={submit} disabled={busy || !form.name.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Opslaan"}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Annuleren
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {clients.length === 0 && !editing && (
          <p className="text-sm text-muted-foreground">Je hebt nog geen apps geregistreerd.</p>
        )}
        {clients.map((row) => (
          <div key={row.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">{row.name}</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">{row.clientId}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {row.scopes.map((s) => (
                  <Badge key={s} variant="secondary">
                    {s}
                  </Badge>
                ))}
                <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                  Bewerken
                </Button>
                <Button size="sm" variant="outline" onClick={() => void onRotate(row)}>
                  <RefreshCw className="h-4 w-4" /> Nieuwe sleutel
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void onDelete(row)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {row.redirectUris.length > 0 && (
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                {row.redirectUris.join(" · ")}
              </p>
            )}
            {shared[row.clientId] && (
              <p role="alert" className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Hetzelfde terugkeeradres staat ook bij: {shared[row.clientId]!.join(", ")}. Controleer welke
                client_id je website gebruikt — die app moet live staan en de juiste sleutel hebben. Verwijder dubbele apps.
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
