import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Smartphone,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notifyError, notifySuccess } from "@/lib/notify";
import { findUsers } from "@/lib/admin.functions";
import {
  blockUserFeature,
  getUserInsightForAdmin,
  grantAdminPermission,
  listAdminAccess,
  setLegalName,
  setUserVerifiedStatus,
} from "@/lib/admin-access.functions";
import { verifiedHandleSuggestionList } from "@/lib/verified-handle";

type Grant = Awaited<ReturnType<typeof listAdminAccess>>[number];
type Insight = Awaited<ReturnType<typeof getUserInsightForAdmin>>;
type UserHit = Awaited<ReturnType<typeof findUsers>>[number];

const PERMISSIONS = [
  { key: "verify_users", label: "Gebruikers verifiëren" },
  { key: "edit_names", label: "Namen bewerken" },
  { key: "manage_promos", label: "Promocodes beheren" },
  { key: "view_device_data", label: "Locatie & toestel bekijken" },
  { key: "block_features", label: "Functies blokkeren" },
  { key: "manage_admins", label: "Admins beheren" },
  { key: "approve_sepa", label: "SEPA goedkeuren" },
  { key: "grant_badges", label: "Wapenschilden toekennen" },
  { key: "manage_integrations", label: "Koppelingen schakelen" },
  { key: "review_apps", label: "OAuth-apps beoordelen" },
  { key: "export_data", label: "Gegevens exporteren" },
  { key: "triage_contact", label: "Contactberichten analyseren met AI" },
] as const;

/** One-click role templates; they only toggle the permissions above. */
const ROLE_TEMPLATES: { label: string; perms: (typeof PERMISSIONS)[number]["key"][] }[] = [
  { label: "Support", perms: ["triage_contact"] },
  { label: "Compliance", perms: ["verify_users", "edit_names", "view_device_data"] },
  { label: "Moderator", perms: ["grant_badges", "block_features"] },
  { label: "Financieel", perms: ["approve_sepa", "export_data"] },
  { label: "Developer Relations", perms: ["review_apps", "manage_integrations"] },
];

const FEATURES = [
  { key: "handle_change", label: "Gebruikersnaam wijzigen" },
  { key: "name_change", label: "Naam wijzigen" },
  { key: "avatar_change", label: "Avatar wijzigen" },
  { key: "links_edit", label: "Links bewerken" },
  { key: "payments", label: "Betalingen" },
] as const;

/**
 * Admin console: delegate single permissions, correct legal names, inspect the
 * approximate location/device signals we already receive, and block individual
 * capabilities temporarily or permanently.
 */
export function AdminAccessPanel() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [insight, setInsight] = useState<Insight>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [handle, setHandle] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [blockReason, setBlockReason] = useState("");
  const [blockUntil, setBlockUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyFirst, setVerifyFirst] = useState("");
  const [verifyLast, setVerifyLast] = useState("");

  const refreshGrants = useCallback(async () => {
    try {
      setGrants(await listAdminAccess());
    } catch {
      /* zonder manage_admins is deze lijst simpelweg leeg */
    }
  }, []);

  useEffect(() => {
    void refreshGrants();
  }, [refreshGrants]);

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    try {
      setHits(await findUsers({ data: { query: query.trim() } }));
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Zoeken mislukt");
    } finally {
      setBusy(false);
    }
  };

  const openUser = async (userId: string) => {
    setBusy(true);
    try {
      const data = await getUserInsightForAdmin({ data: { userId } });
      setInsight(data);
      setVerifyFirst(data?.legalFirstName ?? "");
      setVerifyLast(data?.legalLastName ?? "");
      setFirstName(data?.legalFirstName ?? "");
      setLastName(data?.legalLastName ?? "");
      setHandle(data?.username ?? "");
      setSuggestions([]);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Ophalen mislukt");
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    if (!insight) return;
    setBusy(true);
    try {
      const result = await setLegalName({
        data: {
          userId: insight.userId,
          firstName,
          lastName,
          ...(handle.trim() ? { applyHandle: handle.trim() } : {}),
        },
      });
      if (!result.ok) {
        setSuggestions(result.suggestions ?? []);
        notifyError(result.error);
        return;
      }
      setSuggestions(result.suggestions);
      notifySuccess("Naam opgeslagen.");
      await openUser(insight.userId);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Opslaan mislukt");
    } finally {
      setBusy(false);
    }
  };

  const toggleVerified = async (verified: boolean) => {
    if (!insight) return;
    // Verifiëren kan alleen mét wettelijke naam: die bepaalt de handle.
    if (verified && (!verifyFirst.trim() || !verifyLast.trim())) {
      notifyError("Voor- en achternaam zijn verplicht om te verifiëren.");
      return;
    }
    setBusy(true);
    try {
      const result = await setUserVerifiedStatus({
        data: {
          userId: insight.userId,
          verified,
          ...(verified ? { firstName: verifyFirst.trim(), lastName: verifyLast.trim() } : {}),
        },
      });
      if (!result.ok) {
        notifyError(result.error);
        return;
      }
      notifySuccess(verified ? "Blauw vinkje toegekend." : "Verificatie ingetrokken.");
      setVerifyOpen(false);
      await openUser(insight.userId);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Verifiëren mislukt");
    } finally {
      setBusy(false);
    }
  };

  const toggleBlock = async (feature: (typeof FEATURES)[number]["key"], blocked: boolean) => {
    if (!insight) return;
    setBusy(true);
    try {
      await blockUserFeature({
        data: {
          userId: insight.userId,
          feature,
          blocked,
          ...(blockReason.trim() ? { reason: blockReason.trim() } : {}),
          ...(blocked && blockUntil ? { until: new Date(blockUntil).toISOString() } : {}),
        },
      });
      notifySuccess(blocked ? "Functie geblokkeerd." : "Blokkade opgeheven.");
      await openUser(insight.userId);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Blokkeren mislukt");
    } finally {
      setBusy(false);
    }
  };

  const togglePermission = async (
    userId: string,
    permission: (typeof PERMISSIONS)[number]["key"],
    granted: boolean,
  ) => {
    try {
      await grantAdminPermission({ data: { userId, permission, granted } });
      await refreshGrants();
      notifySuccess(granted ? "Rechten toegekend." : "Rechten ingetrokken.");
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Wijzigen mislukt");
    }
  };

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <ShieldCheck className="h-4 w-4" aria-hidden /> Toegang & gebruikersbeheer
        </h2>
        <p className="text-sm text-muted-foreground">
          Deelrechten uitdelen, echte namen invullen, toestel- en locatiesignalen bekijken en
          functies tijdelijk of permanent blokkeren.
        </p>
      </header>

      {/* --- delegated admins ------------------------------------------- */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Admins & deelrechten</h3>
        {grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen extra admins.</p>
        ) : (
          <ul className="space-y-2">
            {grants.map((grant) => {
              const open = expanded === grant.userId;
              return (
                <li key={grant.userId} className="rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : grant.userId)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                  >
                    <span className="truncate">
                      {grant.email ?? grant.userId}
                      {grant.username ? ` · @${grant.username}` : ""}
                      {grant.fullAdmin ? " · volledige admin" : ""}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </button>
                  {open ? (
                    <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-2">
                      {PERMISSIONS.map((permission) => {
                        const active =
                          grant.fullAdmin || grant.permissions.includes(permission.key);
                        return (
                          <label key={permission.key} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={active}
                              disabled={grant.fullAdmin}
                              onChange={(e) =>
                                void togglePermission(
                                  grant.userId,
                                  permission.key,
                                  e.target.checked,
                                )
                              }
                            />
                            {permission.label}
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* --- user lookup ------------------------------------------------- */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Gebruiker opzoeken</h3>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
            placeholder="e-mail of gebruikersnaam"
            className="h-9"
          />
          <Button type="button" className="h-9" onClick={() => void search()} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Search className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </div>
        {hits.length > 0 ? (
          <ul className="space-y-1">
            {hits.map((hit) => (
              <li key={hit.userId}>
                <button
                  type="button"
                  className="w-full truncate rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => void openUser(hit.userId)}
                >
                  {hit.email ?? hit.userId} {hit.username ? `· @${hit.username}` : ""}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* --- selected user ------------------------------------------------ */}
      {insight ? (
        <div className="space-y-4 rounded-xl border border-border p-3">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <UserCog className="h-4 w-4" aria-hidden /> {insight.email ?? insight.userId}
          </h3>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="admin-first" className="text-xs">
                Voornaam
              </Label>
              <Input
                id="admin-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="admin-last" className="text-xs">
                Achternaam
              </Label>
              <Input
                id="admin-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="admin-handle" className="text-xs">
                Gebruikersnaam
              </Label>
              <Input
                id="admin-handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                className="h-9 font-mono"
              />
            </div>
          </div>
          {suggestions.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {suggestions.slice(0, 8).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="rounded-full border border-border px-2 py-1 font-mono text-xs hover:bg-muted"
                  onClick={() => setHandle(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
          <Button type="button" className="h-9" onClick={() => void saveName()} disabled={busy}>
            Naam & gebruikersnaam opslaan
          </Button>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            <span className="text-sm">
              {insight.verified
                ? "Geverifieerd account — blauw vinkje op rout.be/" + (insight.username ?? "")
                : "Niet geverifieerd — alias-profiel zonder blauw vinkje"}
            </span>
            <Button
              type="button"
              variant={insight.verified ? "outline" : "default"}
              className="ml-auto h-9"
              disabled={busy}
              onClick={() => (insight.verified ? void toggleVerified(false) : setVerifyOpen(true))}
            >
              {insight.verified ? "Verificatie intrekken" : "Markeer als verified"}
            </Button>
          </div>

          <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Markeer als verified</DialogTitle>
                <DialogDescription>
                  Vul de wettelijke voor- en achternaam in. Die naam is verplicht: het account
                  krijgt het blauwe vinkje, de pro-tier en een handle op basis van de naam (voornaam
                  + achternaam, één deel mag een initiaal zijn).
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="verify-first" className="text-xs">
                    Voornaam
                  </Label>
                  <Input
                    id="verify-first"
                    value={verifyFirst}
                    onChange={(e) => setVerifyFirst(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="verify-last" className="text-xs">
                    Achternaam
                  </Label>
                  <Input
                    id="verify-last"
                    value={verifyLast}
                    onChange={(e) => setVerifyLast(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              {verifiedHandleSuggestionList(`${verifyFirst} ${verifyLast}`.trim())[0] ? (
                <p className="font-mono text-xs text-muted-foreground">
                  Voorstel: rout.be/
                  {verifiedHandleSuggestionList(`${verifyFirst} ${verifyLast}`.trim())[0]}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setVerifyOpen(false)}>
                  Annuleren
                </Button>
                <Button type="button" disabled={busy} onClick={() => void toggleVerified(true)}>
                  Blauw vinkje toekennen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <MapPin className="h-4 w-4" aria-hidden /> Locatie (bij benadering)
              </p>
              <p className="text-muted-foreground">
                {insight.city || insight.country
                  ? `${insight.city ?? "—"}, ${insight.country ?? "—"}`
                  : "Onbekend"}
              </p>
            </div>
            <div className="space-y-1 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <Smartphone className="h-4 w-4" aria-hidden /> Toestellen
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {insight.sessions.length === 0 ? <li>Geen sessies</li> : null}
                {insight.sessions.slice(0, 5).map((session, index) => (
                  <li key={index} className="truncate">
                    {session.device ?? "onbekend toestel"}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {insight.socialAccounts.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Gekoppelde accounts:{" "}
              {insight.socialAccounts
                .map((a) => `${a.provider}:@${a.handle ?? "—"}${a.verified ? " ✓" : ""}`)
                .join(" · ")}
            </p>
          ) : null}

          <div className="space-y-2">
            <p className="text-sm font-medium">Functies blokkeren</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="reden (optioneel)"
                className="h-9"
              />
              <Input
                type="datetime-local"
                value={blockUntil}
                onChange={(e) => setBlockUntil(e.target.value)}
                className="h-9"
                aria-label="Blokkeer tot (leeg = permanent)"
              />
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {FEATURES.map((feature) => {
                const active = insight.blocks.some((b) => b.feature === feature.key);
                return (
                  <li
                    key={feature.key}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span>{feature.label}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant={active ? "destructive" : "secondary"}
                      onClick={() => void toggleBlock(feature.key, !active)}
                      disabled={busy}
                    >
                      {active ? "Deblokkeer" : "Blokkeer"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
