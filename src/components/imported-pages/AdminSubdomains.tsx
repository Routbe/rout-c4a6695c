import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@/lib/router-compat";
import { CheckCircle2, ChevronDown, Loader2, Mail, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { amIAdmin } from "@/lib/admin.functions";
import {
  adminListRootClaims,
  adminPromoteRootClaim,
  adminResendClaimMail,
} from "@/lib/subdomain-claims.functions";
import { i18n as trI18n } from "@/lib/i18n";

type Claim = Awaited<ReturnType<typeof adminListRootClaims>>[number];
type StatusFilter = "all" | "pending_dns" | "active" | "failed_mail";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "Alles" },
  { id: "pending_dns", label: "Pending DNS" },
  { id: "active", label: "Actief" },
  { id: "failed_mail", label: "Mail mislukt" },
];

function MailBadge({ status }: { status: string }) {
  const ok = status === "sent";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        ok
          ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
          : "bg-destructive/15 text-destructive"
      }`}
    >
      {status}
    </span>
  );
}

/** Beheerdersoverzicht van alle root-subdomein claims met filters en acties. */
export default function AdminSubdomains() {
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const checkAdmin = useServerFn(amIAdmin);
  const loadClaims = useServerFn(adminListRootClaims);
  const promote = useServerFn(adminPromoteRootClaim);
  const resend = useServerFn(adminResendClaimMail);

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Claim[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      nav("/", { replace: true });
      return;
    }
    void (async () => {
      try {
        const res = await checkAdmin({});
        if (res?.isAdmin) setAllowed(true);
        else {
          setAllowed(false);
          nav("/", { replace: true });
        }
      } catch {
        setAllowed(false);
        nav("/", { replace: true });
      }
    })();
  }, [user, loading, checkAdmin, nav]);

  const refresh = useCallback(async () => {
    setFetching(true);
    try {
      const data = await loadClaims({ data: { status, search: search.trim() } });
      setRows((data ?? []) as Claim[]);
    } catch {
      toast.error(trI18n.t("ui.838abd7d53"));
      setRows([]);
    } finally {
      setFetching(false);
    }
  }, [loadClaims, status, search]);

  useEffect(() => {
    if (!allowed) return;
    const id = setTimeout(() => void refresh(), 250);
    return () => clearTimeout(id);
  }, [allowed, refresh]);

  const total = useMemo(() => rows.length, [rows]);

  if (allowed !== true) {
    return (
      <AppLayout>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Root-subdomeinen</h1>
          <p className="text-sm text-muted-foreground">
            Audit-log van alle root-claims, mailstatus en DNS-activatie.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatus(f.id)}
              aria-pressed={status === f.id}
              className={`h-9 rounded-full border px-3 text-xs font-medium transition-colors ${
                status === f.id ? "border-primary/50 bg-primary/10" : "border-border"
              }`}
            >
              {f.label}
            </button>
          ))}
          <div className="relative ml-auto min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek op naam, handle of e-mail"
              className="h-9 rounded-xl pl-9 text-sm"
            />
          </div>
          <Button variant="outline" size="sm" className="h-9" onClick={() => void refresh()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Vernieuw
          </Button>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Datum</th>
                <th className="px-3 py-2">Gebruiker</th>
                <th className="px-3 py-2">Aangevraagd subdomein</th>
                <th className="px-3 py-2">Admin mail</th>
                <th className="px-3 py-2">User mail</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Acties</th>
              </tr>
            </thead>
            <tbody>
              {fetching && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    Laden…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    Geen claims gevonden.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const failed = row.adminMailStatus !== "sent" || row.userMailStatus !== "sent";
                  const effective = row.rootStatus ?? row.status;
                  return (
                    <>
                      <tr key={row.id} className="border-t border-border align-top">
                        <td className="whitespace-nowrap px-3 py-2 text-xs">
                          {new Date(row.createdAt).toLocaleString("nl-BE")}
                        </td>
                        <td className="px-3 py-2">
                          <span className="block font-medium">
                            {row.displayName || row.username || "—"}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {row.email ?? row.userId}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{row.requestedSubdomain}</td>
                        <td className="px-3 py-2">
                          <MailBadge status={row.adminMailStatus} />
                        </td>
                        <td className="px-3 py-2">
                          <MailBadge status={row.userMailStatus} />
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              effective === "active"
                                ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                                : "bg-amber-500/15 text-amber-900 dark:text-amber-200"
                            }`}
                          >
                            {effective}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1.5">
                            {effective !== "active" && (
                              <Button
                                size="sm"
                                className="h-8 text-xs"
                                disabled={busy === row.id}
                                onClick={async () => {
                                  setBusy(row.id);
                                  try {
                                    await promote({ data: { userId: row.userId } });
                                    toast.success(trI18n.t("ui.e480772acb"));
                                    await refresh();
                                  } catch {
                                    toast.error(trI18n.t("ui.5d604cfd5a"));
                                  } finally {
                                    setBusy(null);
                                  }
                                }}
                              >
                                {busy === row.id ? (
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                )}
                                Activeer nu
                              </Button>
                            )}
                            {failed && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                disabled={busy === `mail-${row.id}`}
                                onClick={async () => {
                                  setBusy(`mail-${row.id}`);
                                  try {
                                    const res = await resend({ data: { claimId: row.id } });
                                    toast.success(
                                      `Admin: ${res.admin_email} · Gebruiker: ${res.user_email}`,
                                    );
                                    await refresh();
                                  } catch {
                                    toast.error(trI18n.t("ui.0cf235c830"));
                                  } finally {
                                    setBusy(null);
                                  }
                                }}
                              >
                                <Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Mail opnieuw
                              </Button>
                            )}
                            {failed && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs"
                                onClick={() => setOpen(open === row.id ? null : row.id)}
                              >
                                <ChevronDown className="mr-1 h-3.5 w-3.5" aria-hidden /> Details
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {open === row.id && (
                        <tr key={`${row.id}-detail`} className="border-t border-border bg-muted/30">
                          <td colSpan={7} className="px-3 py-3">
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background p-3 text-[11px]">
                              {row.errorPayload ?? "—"}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">{total} claim(s)</p>
      </div>
    </AppLayout>
  );
}
