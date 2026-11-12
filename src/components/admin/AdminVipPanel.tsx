import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Crown,
  Loader2,
  RefreshCw,
  RotateCw,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  assignHandle,
  bulkGrantVipHandles,
  findUsers,
  listVipAuditLog,
  listVipGrants,
  myVipConsoleRole,
  retryVipAliasSync,
  revokeVipGrant,
} from "@/lib/admin.functions";
import { SHORT_HANDLE_MAX, SHORT_HANDLE_MIN, needsVipGrant } from "@/lib/handle-rules";
import { strictHandleIssue } from "@/lib/handle-validation";
import { HandleErrorBanner } from "@/components/HandleValidationMessage";
import { i18n as trI18n } from "@/lib/i18n";

type SyncStatus = "synced" | "pending" | "failed";

type Grant = {
  userId: string;
  handle: string | null;
  displayName: string | null;
  verified: boolean;
  grantedAt: string;
  aliasSyncStatus: SyncStatus;
  aliasSyncAttempts: number;
  aliasSyncedAt: string | null;
  aliasSyncError: string | null;
};

type Candidate = {
  userId: string;
  email: string | null;
  displayName: string | null;
  username: string | null;
  verified: boolean;
};

type AuditEntry = {
  id: string;
  adminEmail: string | null;
  action: string;
  targetUserId: string | null;
  targetLabel: string | null;
  notes: string | null;
  createdAt: string;
};

type BulkResult = {
  line: number;
  raw: string;
  handle: string | null;
  ok: boolean;
  message: string;
};

type AuditFilters = {
  handle: string;
  adminEmail: string;
  action: string;
  from: string;
  to: string;
};

const EMPTY_FILTERS: AuditFilters = { handle: "", adminEmail: "", action: "", from: "", to: "" };

const AUDIT_ACTIONS = [
  { value: "", label: "All VIP actions" },
  { value: "vip_handle_granted", label: "Granted" },
  { value: "vip_handle_revoked", label: "Revoked" },
  { value: "vip_alias_retry", label: "Alias retry" },
  { value: "handle_changed", label: "Handle changed" },
];

/** Neon may return Date objects, numbers or null; never assume a string. */
const asIso = (v: unknown): string => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString();
  if (typeof v === "string") return v;
  if (typeof v === "number") return new Date(v).toISOString();
  return "";
};
const dateOnly = (v: unknown) => asIso(v).slice(0, 10) || "—";
const stamp = (v: unknown) => asIso(v).replace("T", " ").slice(0, 16) || "—";

const SYNC_STYLES: Record<SyncStatus, { label: string; className: string }> = {
  synced: {
    label: "Success",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  pending: { label: "Pending", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  failed: { label: "Failed", className: "bg-destructive/15 text-destructive" },
};

function SyncBadge({ status }: { status: SyncStatus }) {
  const style = SYNC_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {style.label}
    </span>
  );
}

/**
 * VIP console for the 3–4 character handles that are reserved by default.
 * Access is restricted to verified `admin` or `security` role holders — the
 * server functions enforce the same gate, this only hides the UI.
 */
export function AdminVipPanel() {
  const probeRole = useServerFn(myVipConsoleRole);
  const loadGrants = useServerFn(listVipGrants);
  const search = useServerFn(findUsers);
  const setHandle = useServerFn(assignHandle);
  const revoke = useServerFn(revokeVipGrant);
  const runBulk = useServerFn(bulkGrantVipHandles);
  const loadAudit = useServerFn(listVipAuditLog);
  const retrySync = useServerFn(retryVipAliasSync);

  const [role, setRole] = useState<string | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);

  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [target, setTarget] = useState<Candidate | null>(null);
  const [newHandle, setNewHandle] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const [bulkInput, setBulkInput] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);

  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);

  const allowed = role === "admin" || role === "security";

  const refreshAudit = useCallback(
    async (next: AuditFilters) => {
      setAuditLoading(true);
      try {
        const payload = {
          ...(next.handle ? { handle: next.handle } : {}),
          ...(next.adminEmail ? { adminEmail: next.adminEmail } : {}),
          ...(next.action ? { action: next.action } : {}),
          ...(next.from ? { from: next.from } : {}),
          ...(next.to ? { to: next.to } : {}),
        };
        setAudit((await loadAudit({ data: payload })) as AuditEntry[]);
      } catch {
        toast.error(trI18n.t("ui.051f8e6b03"));
      } finally {
        setAuditLoading(false);
      }
    },
    [loadAudit],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setGrants((await loadGrants()) as Grant[]);
    } catch {
      toast.error(trI18n.t("ui.c820dab576"));
    } finally {
      setLoading(false);
    }
  }, [loadGrants]);

  useEffect(() => {
    (async () => {
      try {
        const res = (await probeRole()) as { role: string | null };
        setRole(res.role);
        if (res.role) {
          await refresh();
          await refreshAudit(EMPTY_FILTERS);
        }
      } catch {
        setRole(null);
      } finally {
        setRoleChecked(true);
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const failedCount = useMemo(
    () => grants.filter((g) => g.aliasSyncStatus === "failed").length,
    [grants],
  );

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const term = query.trim();
    if (!term) return;
    setSearching(true);
    try {
      const rows = (await search({ data: { query: term } })) as Candidate[];
      setCandidates(rows);
      if (rows.length === 0) toast.info(trI18n.t("ui.d570c6ce27"));
    } catch {
      toast.error(trI18n.t("ui.19d3cf131f"));
    } finally {
      setSearching(false);
    }
  };

  const onGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newHandle.trim().toLowerCase().replace(/^@/, "");
    if (!target) {
      setError("Select the account that should receive the handle first.");
      return;
    }
    const strict = strictHandleIssue(clean);
    if (strict) {
      setError(strict);
      return;
    }
    if (!needsVipGrant(clean)) {
      setError(
        `VIP grants only cover ${SHORT_HANDLE_MIN}- and ${SHORT_HANDLE_MAX}-character handles.`,
      );
      return;
    }
    if (reason.trim().length < 3) {
      setError("A justification is required — it is stored in the audit trail.");
      return;
    }
    setError("");
    setBusy(target.userId);
    try {
      const res = (await setHandle({
        data: {
          userId: target.userId,
          handle: clean,
          vipGrant: true,
          reason: reason.trim(),
        },
      })) as { ok: boolean; reason?: string };
      if (!res.ok) {
        setError(res.reason ?? "Could not allocate this handle.");
        return;
      }
      toast.success(`@${clean} granted.`);
      setNewHandle("");
      setReason("");
      setTarget(null);
      setCandidates([]);
      setQuery("");
      await refresh();
      await refreshAudit(filters);
    } catch {
      toast.error(trI18n.t("ui.9e54d4f402"));
    } finally {
      setBusy(null);
    }
  };

  const onRevoke = async (userId: string, handle: string | null) => {
    const why = window.prompt(
      `Why is the VIP grant${handle ? ` for @${handle}` : ""} being revoked?`,
      "",
    );
    if (why === null) return;
    if (why.trim().length < 3) {
      toast.error(trI18n.t("ui.a149b41741"));
      return;
    }
    setBusy(userId);
    try {
      const res = (await revoke({ data: { userId, reason: why.trim() } })) as {
        ok: boolean;
        reason?: string;
      };
      if (!res.ok) {
        toast.error(res.reason ?? "Could not revoke this grant.");
        return;
      }
      toast.success(trI18n.t("ui.dd76996b71"));
      await refresh();
      await refreshAudit(filters);
    } catch {
      toast.error(trI18n.t("ui.93e4e325dd"));
    } finally {
      setBusy(null);
    }
  };

  const onRetrySync = async (userId: string) => {
    setBusy(userId);
    try {
      const res = (await retrySync({ data: { userId } })) as {
        ok: boolean;
        error?: string | null;
      };
      if (!res.ok) {
        toast.error(res.error ?? "Alias sync could not be retried.");
        return;
      }
      if (res.error) toast.warning(`Retried — last error: ${res.error}`);
      else toast.success(trI18n.t("ui.acc65349e5"));
      await refresh();
    } catch {
      toast.error(trI18n.t("ui.7e7cc097f1"));
    } finally {
      setBusy(null);
    }
  };

  const onBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkInput.trim()) return;
    setBulkRunning(true);
    try {
      const res = (await runBulk({
        data: {
          input: bulkInput,
          ...(bulkReason.trim() ? { reason: bulkReason.trim() } : {}),
        },
      })) as { results: BulkResult[]; granted: number; failed: number };
      setBulkResults(res.results);
      toast[res.failed === 0 ? "success" : "warning"](
        `${res.granted} granted · ${res.failed} failed.`,
      );
      await refresh();
      await refreshAudit(filters);
    } catch {
      toast.error(trI18n.t("ui.993f7e6b51"));
    } finally {
      setBulkRunning(false);
    }
  };

  const onCsvFile = async (file: File | undefined) => {
    if (!file) return;
    setBulkInput(await file.text());
  };

  if (!roleChecked) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 text-center">
        <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden />
      </section>
    );
  }

  if (!allowed) {
    return (
      <section className="space-y-2 rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
        <h2 className="flex items-center gap-2 font-display text-lg">
          <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden /> Restricted
        </h2>
        <p className="text-sm text-muted-foreground">
          The VIP handle console is limited to verified <strong>admin</strong> or{" "}
          <strong>security</strong> role holders. Your account carries neither role.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-2xl border border-border bg-card p-4 pb-6 sm:p-5">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 font-display text-lg">
          <Crown className="h-4 w-4" aria-hidden /> VIP handle grants
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="h-3 w-3" aria-hidden /> {role}
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">
          Handles of {SHORT_HANDLE_MIN}–{SHORT_HANDLE_MAX} characters are reserved. A VIP grant is
          the only way to allocate one, the account has to be verified, and every action needs a
          justification.
        </p>
        {failedCount > 0 && (
          <p className="text-sm text-destructive">
            {failedCount} grant{failedCount === 1 ? "" : "s"} failed to sync with ImprovMX.
          </p>
        )}
      </header>

      {/* ---------------- single grant ---------------- */}
      <div className="space-y-3">
        <form onSubmit={onSearch} className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <Label htmlFor="vip-search">Find account</Label>
            <Input
              id="vip-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="E-mail, handle or user id"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={searching}>
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Search
          </Button>
        </form>

        {candidates.length > 0 && (
          <ul className="space-y-1.5">
            {candidates.map((c) => (
              <li key={c.userId}>
                <button
                  type="button"
                  onClick={() => setTarget(c)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                    target?.userId === c.userId
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <span className="font-medium">{c.displayName ?? c.username ?? "Unnamed"}</span>{" "}
                  <span className="text-muted-foreground">
                    {c.username ? `@${c.username}` : "no handle"} · {c.email ?? "—"} ·{" "}
                    {c.verified ? "verified" : "not verified"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={onGrant} className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[180px] flex-1 space-y-1.5">
              <Label htmlFor="vip-handle">
                Short handle {target ? `for ${target.email ?? target.userId}` : ""}
              </Label>
              <Input
                id="vip-handle"
                value={newHandle}
                onChange={(e) => setNewHandle(e.target.value)}
                maxLength={SHORT_HANDLE_MAX}
                placeholder={`${SHORT_HANDLE_MIN}–${SHORT_HANDLE_MAX} characters`}
              />
            </div>
            <div className="min-w-[240px] flex-[2] space-y-1.5">
              <Label htmlFor="vip-reason">Justification (stored in the audit log)</Label>
              <Input
                id="vip-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder="e.g. brand partnership ROUT-1042"
              />
            </div>
            <Button
              type="submit"
              disabled={!target || busy !== null || Boolean(strictHandleIssue(newHandle))}
            >
              {busy && target ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Grant VIP handle
            </Button>
          </div>
          {strictHandleIssue(newHandle) ? (
            <HandleErrorBanner message={strictHandleIssue(newHandle)!} />
          ) : null}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </div>

      {/* ---------------- bulk grant ---------------- */}
      <details className="rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">Bulk grant (CSV or paste)</summary>
        <form onSubmit={onBulk} className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            One grant per line: <code>handle, email-or-handle-or-id, reason</code>. Max 100 lines.
            Lines starting with <code>#</code> and a <code>handle,…</code> header are skipped.
          </p>
          <Textarea
            value={bulkInput}
            onChange={(e) => setBulkInput(e.target.value)}
            rows={6}
            className="font-mono text-xs"
            placeholder={
              "kim, kim@example.com, launch partner\nrout, ada@example.com, brand reserve"
            }
          />
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Label htmlFor="vip-bulk-reason">Fallback justification</Label>
              <Input
                id="vip-bulk-reason"
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                maxLength={500}
                placeholder="Used when a line has no reason column"
              />
            </div>
            <Label
              htmlFor="vip-csv"
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted"
            >
              <Upload className="h-4 w-4" aria-hidden /> CSV
            </Label>
            <input
              id="vip-csv"
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              onChange={(e) => void onCsvFile(e.target.files?.[0])}
            />
            <Button type="submit" disabled={bulkRunning || !bulkInput.trim()}>
              {bulkRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Run bulk grant
            </Button>
          </div>

          {bulkResults.length > 0 && (
            <ul className="space-y-1 text-xs">
              {bulkResults.map((r) => (
                <li
                  key={`${r.line}-${r.raw}`}
                  className={r.ok ? "text-muted-foreground" : "text-destructive"}
                >
                  <span className="font-mono">line {r.line}</span> · {r.ok ? "✓" : "✗"} {r.message}
                </li>
              ))}
            </ul>
          )}
        </form>
      </details>

      {/* ---------------- active grants ---------------- */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Active grants</h3>
          <Button type="button" variant="ghost" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <th className="p-3 font-medium">Handle</th>
                <th className="p-3 font-medium">Account</th>
                <th className="p-3 font-medium">ImprovMX sync</th>
                <th className="p-3 font-medium">Since</th>
                <th className="p-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading &&
                grants.map((g) => (
                  <tr key={g.userId} className="align-top hover:bg-muted/40">
                    <td className="p-3 font-medium">{g.handle ? `@${g.handle}` : "—"}</td>
                    <td className="p-3 text-muted-foreground">
                      {g.displayName ?? "Unnamed"}
                      {g.verified ? "" : " · not verified"}
                    </td>
                    <td className="p-3">
                      <SyncBadge status={g.aliasSyncStatus} />
                      <div className="mt-1 text-xs text-muted-foreground">
                        {stamp(g.aliasSyncedAt)}
                        {g.aliasSyncAttempts > 0 ? ` · ${g.aliasSyncAttempts} attempt(s)` : ""}
                      </div>
                      {g.aliasSyncError && (
                        <p className="mt-1 max-w-[280px] break-words text-xs text-destructive">
                          {g.aliasSyncError}
                        </p>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{dateOnly(g.grantedAt)}</td>
                    <td className="whitespace-nowrap p-3 text-right">
                      {g.aliasSyncStatus !== "synced" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy === g.userId}
                          onClick={() => void onRetrySync(g.userId)}
                        >
                          <RotateCw className="h-4 w-4" /> Retry
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={busy === g.userId}
                        onClick={() => void onRevoke(g.userId, g.handle)}
                      >
                        Revoke
                      </Button>
                    </td>
                  </tr>
                ))}
              {!loading && grants.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-muted-foreground">
                    No active VIP grants.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- audit log ---------------- */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">VIP audit log</h3>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void refreshAudit(filters);
          }}
        >
          <div className="min-w-[140px] flex-1 space-y-1.5">
            <Label htmlFor="vip-f-handle">Handle</Label>
            <Input
              id="vip-f-handle"
              value={filters.handle}
              onChange={(e) => setFilters({ ...filters, handle: e.target.value })}
              placeholder="@kim"
            />
          </div>
          <div className="min-w-[160px] flex-1 space-y-1.5">
            <Label htmlFor="vip-f-admin">Admin</Label>
            <Input
              id="vip-f-admin"
              value={filters.adminEmail}
              onChange={(e) => setFilters({ ...filters, adminEmail: e.target.value })}
              placeholder="admin@rout.be"
            />
          </div>
          <div className="min-w-[150px] space-y-1.5">
            <Label htmlFor="vip-f-action">Action</Label>
            <select
              id="vip-f-action"
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {AUDIT_ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vip-f-from">From</Label>
            <Input
              id="vip-f-from"
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vip-f-to">To</Label>
            <Input
              id="vip-f-to"
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={auditLoading}>
            {auditLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Filter
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              void refreshAudit(EMPTY_FILTERS);
            }}
          >
            Reset
          </Button>
        </form>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <th className="p-3 font-medium">When</th>
                <th className="p-3 font-medium">Admin</th>
                <th className="p-3 font-medium">Action</th>
                <th className="p-3 font-medium">Handle</th>
                <th className="p-3 font-medium">Reason / notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {auditLoading && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </td>
                </tr>
              )}
              {!auditLoading &&
                audit.map((a) => (
                  <tr key={a.id} className="hover:bg-muted/40">
                    <td className="whitespace-nowrap p-3 text-muted-foreground">
                      {stamp(a.createdAt)}
                    </td>
                    <td className="p-3 text-muted-foreground">{a.adminEmail ?? "—"}</td>
                    <td className="p-3">{a.action}</td>
                    <td className="p-3">{a.targetLabel ? `@${a.targetLabel}` : "—"}</td>
                    <td className="p-3 text-muted-foreground">{a.notes ?? "—"}</td>
                  </tr>
                ))}
              {!auditLoading && audit.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-muted-foreground">
                    No VIP actions for these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default AdminVipPanel;
