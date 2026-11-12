import { useCallback, useEffect, useState } from "react";
import { Copy, Crown, Globe, Loader2, Mail } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getMySubdomainSettings, setMySubdomainSettings } from "@/lib/subdomain.functions";
import { getMyRootClaims, resendMyClaimMail } from "@/lib/subdomain-claims.functions";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { i18n as trI18n } from "@/lib/i18n";

type ClaimHistory = Awaited<ReturnType<typeof getMyRootClaims>>[number];
type MailDiagnostics = { admin: string; user: string } | null;

type Tier = "free" | "pro" | "root_lifetime";
type RootStatus = "none" | "pending_dns" | "active";

const TIER_KEY: Record<Tier, string> = {
  free: "root.tier.free",
  pro: "root.tier.pro",
  root_lifetime: "root.tier.root_lifetime",
};

/** Compacte diagnostische badge voor de Brevo-verzendstatus. */
function MailStatusBadge({ label, status }: { label: string; status: string }) {
  const ok = status === "sent";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        ok
          ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
          : "bg-destructive/15 text-destructive",
      )}
    >
      {label}: {status}
    </span>
  );
}

/**
 * Domeininstellingen: het actieve subdomein per tier (gratis `*.u.rout.be`,
 * pro `*.r.rout.be`, root `*.rout.be`), plus de root-add-on aanvraag en de
 * AT Protocol DID. Autosave op de achtergrond.
 */
export function SubdomainPanel() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [username, setUsername] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [tier, setTier] = useState<Tier>("free");
  const [rootStatus, setRootStatus] = useState<RootStatus>("none");
  const [enabled, setEnabled] = useState(false);
  const [target, setTarget] = useState<"rout_profile" | "bluesky">("rout_profile");
  const [did, setDid] = useState("");
  const [saving, setSaving] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [mailDiag, setMailDiag] = useState<MailDiagnostics>(null);
  const [claims, setClaims] = useState<ClaimHistory[]>([]);
  const [resending, setResending] = useState<string | null>(null);
  const loadSettings = useServerFn(getMySubdomainSettings);
  const saveSettings = useServerFn(setMySubdomainSettings);
  const loadClaims = useServerFn(getMyRootClaims);
  const resendMail = useServerFn(resendMyClaimMail);

  const refreshStatus = useCallback(async () => {
    const data = await loadSettings({});
    setUsername(data.username);
    setActive(data.activeSubdomain);
    setTier(data.tier);
    setRootStatus(data.rootStatus);
    return data.rootStatus;
  }, [loadSettings]);

  const refreshClaims = useCallback(async () => {
    try {
      setClaims(((await loadClaims({})) ?? []) as ClaimHistory[]);
    } catch {
      /* claim-historie is optioneel */
    }
  }, [loadClaims]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const data = await loadSettings({});
      setUsername(data.username);
      setActive(data.activeSubdomain);
      setTier(data.tier);
      setRootStatus(data.rootStatus);
      setEnabled(data.subdomainEnabled);
      setTarget(data.redirectTarget === "bluesky" ? "bluesky" : "rout_profile");
      setDid(data.blueskyDid ?? "");
      setLoaded(true);
      void refreshClaims();
    })();
  }, [user, loadSettings, refreshClaims]);

  // Realtime statuspolling: elke 30s en bij vensterfocus zolang DNS loopt.
  useEffect(() => {
    if (!user || rootStatus !== "pending_dns") return;
    let stopped = false;
    const check = async () => {
      try {
        const next = await refreshStatus();
        if (!stopped && next === "active") {
          toast.success(t("root.nowLive"));
          void refreshClaims();
        }
      } catch {
        /* stille achtergrondcontrole */
      }
    };
    const id = setInterval(() => void check(), 30_000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, rootStatus, refreshStatus, refreshClaims]);

  // Stille autosave zodra de schakelaar, het doel of de DID wijzigt.
  useEffect(() => {
    if (!user || !loaded) return;
    if (target === "bluesky" && !did.trim().startsWith("did:")) return;
    const id = setTimeout(async () => {
      setSaving(true);
      try {
        await saveSettings({ data: { enabled, target, did: did.trim() || null } });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("root.saveFailed"),
        );
      }
      setSaving(false);
    }, 800);
    return () => clearTimeout(id);
  }, [user, loaded, enabled, target, did, saveSettings]);

  const handle = (username ?? "jouwhandle").toLowerCase();
  const bare = (active ?? `${handle}.u.rout.be`).replace(/^https?:\/\//i, "").replace(/\/.*$/, "");

  const onClaimRoot = async () => {
    if (!user) return;
    setClaiming(true);
    setConflict(false);
    setMailDiag(null);
    try {
      const res = await fetch("/api/claim-root", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: user.id,
          handle,
          email: user.email,
          userName: (user.user_metadata?.["full_name"] as string | undefined)?.trim() || handle,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        subdomain?: string;
        admin_email?: string;
        user_email?: string;
        admin_mail_error?: string;
        user_mail_error?: string;
        status?: RootStatus;
      };

      if (res.status === 401) {
        toast.error(trI18n.t("ui.f9c2916783"));
        return;
      }
      if (res.status === 409) {
        // Zonder status is het geen lopende eigen aanvraag maar een naam die
        // al bij een ander account hoort.
        if (!data.status) {
          toast.error(data.error ?? t("root.claimTaken"));
          return;
        }
        setConflict(true);
        setTier("root_lifetime");
        setRootStatus(data.status);
        void refreshClaims();
        return;
      }
      if (!res.ok || !data.success) {
        toast.error(data.error ?? t("root.claimFailed"));
        return;
      }

      // Directe lokale state-update zodat de amberbanner meteen verschijnt.
      setTier("root_lifetime");
      setRootStatus("pending_dns");
      setMailDiag({ admin: data.admin_email ?? "onbekend", user: data.user_email ?? "onbekend" });
      toast.success(t("root.claimReceived", { host: data.subdomain ?? `${handle}.rout.be` }));
      if (data.user_email && data.user_email !== "sent") {
        toast.warning(t("root.mailWarning"));
      }
      void refreshClaims();
    } catch {
      toast.error(t("root.claimFailed"));
    } finally {
      setClaiming(false);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <Globe className="h-4 w-4" aria-hidden /> {t("root.title")}
      </h2>
      <p className="-mt-1 text-xs text-muted-foreground">
        {t("root.intro")}
      </p>

      {/* Primair actief subdomein */}
      <div className="rounded-xl border border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("root.activeSubdomain")}
          </p>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium">
            {t(TIER_KEY[tier])}
          </span>
          {tier === "root_lifetime" && rootStatus === "pending_dns" && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium">
              {t("root.pendingBadge")}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-start gap-1.5">
          <p className="min-w-0 flex-1 break-all font-mono text-sm">https://{bare}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 rounded-lg text-xs"
            onClick={() => {
              void navigator.clipboard.writeText(bare);
              toast.success(t("root.copied"));
            }}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden /> {t("root.copyDomain")}
          </Button>
        </div>
      </div>

      {conflict && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-foreground">
          {t("root.conflict")}
        </p>
      )}

      {mailDiag && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-[11px]">
          <span className="text-muted-foreground">{t("root.mailStatus")}</span>
          <MailStatusBadge label="Admin mail" status={mailDiag.admin} />
          <MailStatusBadge label="User mail" status={mailDiag.user} />
        </div>
      )}

      {rootStatus === "pending_dns" && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-foreground">
          {t("root.pending", { host: `${handle}.rout.be`, fallback: `${handle}.r.rout.be` })}
        </p>
      )}

      {tier === "root_lifetime" && rootStatus === "active" && (
        <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-foreground">
          {t("root.live", { host: `${handle}.rout.be` })}
        </p>
      )}

      {claims.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("root.history")}
          </p>
          {claims.map((c) => {
            const failed = c.adminMailStatus !== "sent" || c.userMailStatus !== "sent";
            const effective = c.rootStatus ?? c.status;
            return (
              <div key={c.id} className="space-y-1.5 rounded-lg border border-border/60 p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{c.requestedSubdomain}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                      effective === "active"
                        ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                        : "bg-amber-500/15 text-amber-900 dark:text-amber-200",
                    )}
                  >
                    {effective}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString("nl-BE")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <MailStatusBadge label="Admin mail" status={c.adminMailStatus} />
                  <MailStatusBadge label="User mail" status={c.userMailStatus} />
                </div>
                {failed && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-destructive">
                      {t("root.mailFailed")}
                      {c.errorPayload ? ` — ${c.errorPayload.slice(0, 160)}` : ""}.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg text-xs"
                      disabled={resending === c.id}
                      onClick={async () => {
                        setResending(c.id);
                        try {
                          const res = await resendMail({ data: { claimId: c.id } });
                          toast.success(`Admin: ${res.admin_email} · Gebruiker: ${res.user_email}`);
                          await refreshClaims();
                        } catch {
                          toast.error(t("root.resendFailed"));
                        } finally {
                          setResending(null);
                        }
                      }}
                    >
                      {resending === c.id ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      )}
                      {t("root.resend")}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rootStatus === "none" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t("root.offer.title", { host: `${handle}.rout.be` })}</p>
            <p className="text-[11px] text-muted-foreground">
              {t("root.offer.price")}
            </p>
          </div>
          <Button
            type="button"
            className="h-9 w-full rounded-xl sm:w-auto"
            disabled={claiming}
            onClick={onClaimRoot}
          >
            {claiming ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Crown className="mr-2 h-4 w-4" aria-hidden />
            )}
            {t("root.offer.cta")}
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl border border-border p-3">
        <span className="text-sm">{t("root.enable")}</span>
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={t("root.enable")} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "rout_profile", label: t("root.target.profile") },
            { id: "bluesky", label: t("root.target.bluesky") },
          ] as const
        ).map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setTarget(o.id)}
            className={cn(
              "h-10 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
              target === o.id ? "border-primary/50 bg-primary/10" : "border-border",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <label className="input-label" htmlFor="p-did">
          {t("root.did.label")}{" "}
          <span className="font-normal text-muted-foreground">{t("root.did.hint")}</span>
        </label>
        <Input
          id="p-did"
          value={did}
          maxLength={200}
          placeholder="did:plc:…"
          onChange={(e) => setDid(e.target.value)}
          className="input-field h-11 rounded-xl"
        />
        <p className="break-all text-[11px] text-muted-foreground">
          {t("root.did.served", { host: bare })}
        </p>
      </div>

      <p aria-live="polite" className="text-center text-[11px] text-muted-foreground">
        {saving ? t("root.saving") : t("root.autosave")}
      </p>
    </section>
  );
}
