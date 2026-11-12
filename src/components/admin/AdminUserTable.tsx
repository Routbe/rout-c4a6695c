import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  Ban,
  ChevronDown,
  Crown,
  Eraser,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldOff,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VerifyUserDialog } from "@/components/admin/VerifyUserDialog";
import { UserHandleEditor } from "@/components/admin/UserHandleEditor";
import { StatusBadge, SyncBadge, Pager } from "@/components/admin/AdminPrimitives";
import { adminToastError, locationBadge, MIN_REASON, reasonValid } from "@/lib/admin-format";
import {
  banUser,
  bulkGrantVipToUsers,
  bulkModerateUsers,
  bulkRetryAlias,
  cleanseProfileContent,
  listUsers,
  suspendProfile,
} from "@/lib/admin.functions";
import type { UserSegment } from "@/lib/admin-segments";
import type { BulkAction, Confirmation, UserRow } from "@/types/admin";
import { i18n as trI18n } from "@/lib/i18n";

export function AdminUserTable({
  allowed,
  busy,
  setBusy,
  askConfirm,
  improvmxReady,
  onSyncNow,
  refreshAliases,
  refreshAudit,
}: {
  allowed: boolean;
  busy: string | null;
  setBusy: (v: string | null) => void;
  askConfirm: (c: Confirmation) => void;
  improvmxReady: boolean;
  onSyncNow: (retryFailed?: boolean, userId?: string) => Promise<void>;
  refreshAliases: (page?: number, perPage?: number) => void | Promise<void>;
  refreshAudit: (cursor?: string | null) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const loadUsers = useServerFn(listUsers);
  const suspend = useServerFn(suspendProfile);
  const ban = useServerFn(banUser);
  const cleanse = useServerFn(cleanseProfileContent);
  const bulkModerate = useServerFn(bulkModerateUsers);
  const bulkVip = useServerFn(bulkGrantVipToUsers);
  const bulkRetryAliasFn = useServerFn(bulkRetryAlias);

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userPerPage, setUserPerPage] = useState(20);
  const [usersLoading, setUsersLoading] = useState(false);
  // Uitklapbare gebruikerskaarten: standaard compact, details op verzoek.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [moderating, setModerating] = useState<{
    row: UserRow;
    kind: "suspend" | "ban";
  } | null>(null);
  const [moderationReason, setModerationReason] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [segment, setSegment] = useState<UserSegment>("all");
  const [bulk, setBulk] = useState<BulkAction | null>(null);
  const [bulkReason, setBulkReason] = useState("");
  const [banAck, setBanAck] = useState(false);
  const searchTimer = useRef<number | undefined>(undefined);

  const refreshUsers = useCallback(
    async (page = userPage, perPage = userPerPage, q = query, seg = segment) => {
      setUsersLoading(true);
      try {
        const res = await loadUsers({
          data: { query: q || undefined, page, perPage, segment: seg === "all" ? undefined : seg },
        });
        setUsers(res.rows);
        setUserTotal(res.total);
      } catch (error) {
        adminToastError(error, "Could not load users.");
      } finally {
        setUsersLoading(false);
      }
    },
    [loadUsers, query, userPage, userPerPage, segment],
  );

  useEffect(() => {
    if (!allowed) return;
    void refreshUsers(1, 20, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  /** Debounced server-side search. */
  const onQueryChange = (value: string) => {
    setQuery(value);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      setUserPage(1);
      void refreshUsers(1, userPerPage, value);
    }, 400);
  };

  const onSuspend = async (row: UserRow, suspended: boolean, reason?: string) => {
    setBusy(row.userId);
    try {
      const res = await suspend({ data: { userId: row.userId, suspended, reason } });
      if (!res.ok) throw new Error(res.reason);
      toast.success(suspended ? "Profile suspended." : "Profile reinstated.");
      void refreshUsers();
      void refreshAudit(null);
    } catch (error) {
      adminToastError(error, "Could not update this profile.");
    } finally {
      setBusy(null);
      setModerating(null);
      setModerationReason("");
    }
  };

  const onBan = async (row: UserRow, banned: boolean, reason?: string) => {
    setBusy(row.userId);
    try {
      const res = await ban({ data: { userId: row.userId, banned, reason } });
      if (!res.ok) throw new Error(res.reason);
      toast.success(banned ? "User banned — sign-in blocked and alias frozen." : "Ban lifted.");
      void refreshUsers();
      void refreshAliases();
      void refreshAudit(null);
    } catch (error) {
      adminToastError(error, "Could not update the ban state.");
    } finally {
      setBusy(null);
      setModerating(null);
      setModerationReason("");
    }
  };

  const onCleanse = async (
    row: UserRow,
    payload: { clearTagline?: boolean; resetAvatar?: boolean; removeBlockIndexes?: number[] },
  ) => {
    setBusy(row.userId);
    try {
      const res = await cleanse({ data: { userId: row.userId, ...payload } });
      if (!res.ok) throw new Error(res.reason);
      toast.success(trI18n.t("ui.a1e384ab57"));
      void refreshUsers();
      void refreshAudit(null);
    } catch (error) {
      adminToastError(error, "Could not cleanse this profile.");
    } finally {
      setBusy(null);
    }
  };

  const allSelected = users.length > 0 && selected.length === users.length;

  const toggleSelected = (userId: string, checked: boolean) =>
    setSelected((prev) =>
      checked ? [...new Set([...prev, userId])] : prev.filter((id) => id !== userId),
    );

  const toggleAllSelected = (checked: boolean) =>
    setSelected(checked ? users.map((u) => u.userId) : []);

  // Suspending or banning in bulk always needs a written reason.
  const bulkNeedsReason = bulk === "suspend" || bulk === "ban";

  const BULK_COPY: Record<BulkAction, { title: string; description: string; label: string }> = {
    suspend: {
      title: "Suspend selected accounts?",
      description:
        "Their public profiles show a suspension notice and dynamic QR redirects are paused.",
      label: "Suspend accounts",
    },
    unsuspend: {
      title: "Reinstate selected accounts?",
      description: "Their public profiles and dynamic QR redirects go live again.",
      label: "Reinstate accounts",
    },
    ban: {
      title: "Permanently ban selected accounts?",
      description: "Sign-in is blocked, profiles go dark and @rout.be aliases are frozen.",
      label: "Ban accounts",
    },
    cleanse: {
      title: "Wipe content on selected accounts?",
      description: "Bios are cleared and avatars reset. This cannot be undone.",
      label: "Wipe content",
    },
  };

  const onBulkRun = async () => {
    if (!bulk || selected.length === 0) return;
    setBusy("bulk");
    try {
      const res = await bulkModerate({
        data: { userIds: selected, action: bulk, reason: bulkReason || undefined },
      });
      toast.success(
        `${BULK_COPY[bulk].label}: ${res.succeeded} of ${selected.length} accounts updated${
          res.failed > 0 ? ` · ${res.failed} failed` : ""
        }.`,
      );
      setSelected([]);
      void refreshUsers();
      void refreshAliases();
      void refreshAudit(null);
    } catch {
      toast.error(trI18n.t("ui.937df3e378"));
    } finally {
      setBusy(null);
      setBulk(null);
      setBulkReason("");
    }
  };

  const onBulkVipGrant = async () => {
    if (selected.length === 0) return;
    setBusy("bulk");
    try {
      const res = await bulkVip({ data: { userIds: selected } });
      toast.success(
        `VIP grant: ${res.succeeded} of ${selected.length} accounts updated${res.failed > 0 ? ` · ${res.failed} failed` : ""}.`,
      );
      setSelected([]);
      void refreshUsers();
      void refreshAudit(null);
    } catch (error) {
      adminToastError(error, "Could not grant VIP to the selected accounts.");
    } finally {
      setBusy(null);
    }
  };
  // onBulkVipGrant is intentionally kept even though not wired to a visible
  // control here — preserves prior behaviour of the source file.
  void onBulkVipGrant;

  const onBulkRetryAlias = async () => {
    if (selected.length === 0) return;
    setBusy("bulk");
    try {
      const res = await bulkRetryAliasFn({ data: { userIds: selected } });
      toast.success(
        `Alias retry: ${res.succeeded} of ${selected.length} accounts synced${res.failed > 0 ? ` · ${res.failed} still failing` : ""}.`,
      );
      setSelected([]);
      void refreshUsers();
      void refreshAliases();
    } catch (error) {
      adminToastError(error, "Could not retry alias sync for the selected accounts.");
    } finally {
      setBusy(null);
    }
  };
  void onBulkRetryAlias;

  return (
    <>
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 pb-6 sm:p-5">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[16rem] flex-1 space-y-1">
            <Label htmlFor="admin-search" className="text-xs">
              {t("admin.users.search_label")}
            </Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="admin-search"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="jane@domain.com / @jane / uuid"
                className="h-9 pl-8"
              />
            </div>
          </div>
          {usersLoading ? <Loader2 className="mb-2 h-4 w-4 animate-spin" /> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-muted/40 p-2">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(v) => toggleAllSelected(v === true)}
              aria-label="Select all users on this page"
              data-testid="select-all-users"
            />
            Select all on page
          </label>
          <span className="text-xs text-muted-foreground" data-testid="bulk-count">
            {selected.length} selected
          </span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {(
              [
                ["suspend", "Suspend Selected"],
                ["unsuspend", "Unsuspend Selected"],
                ["ban", "Ban Selected"],
                ["cleanse", "Cleanse Content"],
              ] as [BulkAction, string][]
            ).map(([action, label]) => (
              <Button
                key={action}
                size="sm"
                variant="outline"
                className={action === "ban" ? "h-8 text-destructive" : "h-8"}
                data-testid={`bulk-${action}`}
                disabled={selected.length === 0 || busy === "bulk"}
                onClick={() => {
                  setBulkReason("");
                  setBanAck(false);
                  setBulk(action);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {users.length === 0 && !usersLoading ? (
            <p className="text-sm text-muted-foreground">{t("admin.users.none")}</p>
          ) : null}
          {users.map((row) => {
            const isOpen = expanded[row.userId] ?? false;
            return (
              <div
                key={row.userId}
                data-testid="admin-user-row"
                className="rounded-xl border border-border/70 p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      className="mt-1"
                      checked={selected.includes(row.userId)}
                      onCheckedChange={(v) => toggleSelected(row.userId, v === true)}
                      aria-label={`Select ${row.email ?? row.userId}`}
                      data-testid="select-user"
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {row.displayName ?? "Unnamed"}{" "}
                        {row.verified ? (
                          <BadgeCheck className="inline h-3.5 w-3.5 text-primary" aria-hidden />
                        ) : null}
                      </p>
                      <UserHandleEditor
                        userId={row.userId}
                        username={row.username}
                        aliasHandle={row.aliasHandle}
                        verified={row.verified}
                        vipGrant={row.handleGrant === "vip"}
                        onSaved={() => {
                          void refreshUsers();
                          void refreshAliases();
                          void refreshAudit(null);
                        }}
                      />
                      <p className="text-xs text-muted-foreground">{row.email ?? "—"}</p>
                      {isOpen ? (
                        <>
                          <p className="font-mono text-[10px] text-muted-foreground">
                            {row.userId}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {locationBadge(row.lastCountry, row.lastCity)}
                          </p>
                          <SyncBadge
                            status={row.aliasSyncStatus}
                            at={row.aliasSyncedAt}
                            attempts={row.aliasSyncAttempts}
                            error={row.aliasSyncError}
                          />
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={row.isBanned ? "banned" : row.status} />
                    <span
                      data-testid="paid-badge"
                      className={
                        row.isPaid
                          ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase text-emerald-600"
                          : "rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground"
                      }
                    >
                      {row.isPaid ? t("admin.users.paid") : t("admin.users.unpaid")}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase">
                      {row.tier}
                    </span>
                    {row.handleGrant === "vip" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase text-amber-600">
                        <Crown className="h-3 w-3" aria-hidden /> VIP
                      </span>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2"
                      aria-expanded={isOpen}
                      data-testid="toggle-user-row"
                      onClick={() => setExpanded((prev) => ({ ...prev, [row.userId]: !isOpen }))}
                    >
                      {isOpen ? "Inklappen" : "Uitklappen"}
                      <ChevronDown
                        className={`ml-1 h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        aria-hidden
                      />
                    </Button>
                  </div>
                </div>

                {isOpen ? (
                  <>
                    <div className="mt-3 grid gap-3">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Standard actions
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <VerifyUserDialog
                            userId={row.userId}
                            displayName={row.displayName}
                            alreadyVerified={Boolean(row.verified)}
                            onDone={() => void refreshUsers()}
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8"
                            disabled={busy === row.userId}
                            onClick={() =>
                              askConfirm({
                                title: "Clear this bio?",
                                description:
                                  "The bio and tagline disappear from the public profile. This cannot be undone.",
                                actionLabel: "Clear bio",
                                run: () => onCleanse(row, { clearTagline: true }),
                              })
                            }
                          >
                            <Eraser className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Clear bio
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-8"
                            disabled={busy === row.userId}
                            onClick={() =>
                              askConfirm({
                                title: "Reset this avatar?",
                                description:
                                  "The profile picture is removed and replaced by the default placeholder.",
                                actionLabel: "Reset avatar",
                                run: () => onCleanse(row, { resetAvatar: true }),
                              })
                            }
                          >
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Reset avatar
                          </Button>
                          {row.aliasSyncStatus === "failed" ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-8"
                              data-testid="retry-alias"
                              disabled={busy === row.userId || !improvmxReady}
                              onClick={() => void onSyncNow(false, row.userId)}
                            >
                              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Retry alias
                              sync
                            </Button>
                          ) : null}
                        </div>

                        {row.tagline ? (
                          <p className="line-clamp-2 text-[11px] text-muted-foreground">
                            Bio: {row.tagline}
                          </p>
                        ) : null}
                        {row.blocks.length > 0 ? (
                          <ul className="space-y-1">
                            {row.blocks.slice(0, 6).map((b, index) => (
                              <li
                                key={`${row.userId}-${index}`}
                                className="flex items-center justify-between gap-2 text-[11px]"
                              >
                                <span className="truncate text-muted-foreground">
                                  {b.label ?? b.kind ?? "link"} — {b.value ?? ""}
                                </span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-destructive"
                                  disabled={busy === row.userId}
                                  onClick={() =>
                                    askConfirm({
                                      title: "Remove this link?",
                                      description: `“${b.label ?? b.kind ?? "link"}” is deleted from the public profile.`,
                                      actionLabel: "Remove link",
                                      destructive: true,
                                      run: () => onCleanse(row, { removeBlockIndexes: [index] }),
                                    })
                                  }
                                >
                                  <Trash2 className="h-3 w-3" aria-hidden />
                                </Button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {row.moderationReason ? (
                          <p className="text-[11px] text-destructive">
                            Reason: {row.moderationReason}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {/* Danger zone: isolated so a stray tap cannot ban anyone. */}
                    <details
                      className="mt-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3"
                      data-testid="danger-zone"
                    >
                      <summary className="cursor-pointer text-xs font-semibold text-destructive">
                        Danger zone
                      </summary>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        These actions take the profile offline and require a written reason.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant={row.isSuspended ? "outline" : "destructive"}
                          className="h-8"
                          data-testid="suspend-user"
                          disabled={busy === row.userId}
                          onClick={() => {
                            if (row.isSuspended) return onSuspend(row, false);
                            setModerationReason("");
                            setBanAck(false);
                            setModerating({ row, kind: "suspend" });
                          }}
                        >
                          <ShieldOff className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                          {row.isSuspended ? "Reinstate profile" : "Suspend profile"}
                        </Button>
                        <Button
                          size="sm"
                          variant={row.isBanned ? "outline" : "destructive"}
                          className="h-8"
                          data-testid="ban-user"
                          disabled={busy === row.userId}
                          onClick={() => {
                            if (row.isBanned) return onBan(row, false);
                            setModerationReason("");
                            setBanAck(false);
                            setModerating({ row, kind: "ban" });
                          }}
                        >
                          <Ban className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                          {row.isBanned ? "Lift ban" : "Ban & freeze e-mail alias"}
                        </Button>
                      </div>
                    </details>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>

        <Pager
          idPrefix="users"
          page={userPage}
          perPage={userPerPage}
          total={userTotal}
          loading={usersLoading}
          onPage={(p) => {
            setUserPage(p);
            void refreshUsers(p, userPerPage, query);
          }}
          onPerPage={(n) => {
            setUserPerPage(n);
            setUserPage(1);
            void refreshUsers(1, n, query);
          }}
        />
      </section>

      {/* Suspend / ban --------------------------------------------------- */}
      <Dialog open={Boolean(moderating)} onOpenChange={(open) => !open && setModerating(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {moderating?.kind === "ban" ? "Permanently ban this user?" : "Suspend this profile?"}
            </DialogTitle>
            <DialogDescription>
              {moderating?.kind === "ban"
                ? "This person can no longer sign in, their public page goes offline and their @rout.be e-mail address stops working."
                : "Their public page shows a suspension notice and their dynamic QR links stop redirecting until you reinstate them."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="moderation-reason" className="text-xs">
              Reason (required — stored in the audit log and sent to the member)
            </Label>
            <Textarea
              id="moderation-reason"
              data-testid="moderation-reason"
              value={moderationReason}
              onChange={(e) => setModerationReason(e.target.value)}
              placeholder="Why is this account being moderated?"
              rows={3}
            />
            <p className="text-[11px] text-muted-foreground">
              {moderationReason.trim().length < MIN_REASON
                ? `At least ${MIN_REASON} characters (${moderationReason.trim().length}/${MIN_REASON}).`
                : "Reason looks good."}
            </p>
            {moderating?.kind === "ban" ? (
              <label className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs">
                <Checkbox
                  className="mt-0.5"
                  checked={banAck}
                  onCheckedChange={(v) => setBanAck(v === true)}
                  data-testid="ban-ack"
                  aria-label="Confirm this permanent ban"
                />
                <span>
                  I understand this permanently bans{" "}
                  <strong className="break-all">
                    {moderating.row.username
                      ? `@${moderating.row.username}`
                      : (moderating.row.email ?? moderating.row.userId)}
                  </strong>
                  .
                </span>
              </label>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModerating(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              data-testid="moderation-confirm-run"
              disabled={
                !reasonValid(moderationReason) ||
                (moderating?.kind === "ban" && !banAck) ||
                Boolean(busy)
              }
              onClick={() => {
                if (!moderating) return;
                const reason = moderationReason.trim();
                if (moderating.kind === "ban") void onBan(moderating.row, true, reason);
                else void onSuspend(moderating.row, true, reason);
              }}
            >
              {moderating?.kind === "ban" ? "Ban user" : "Suspend profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk moderation confirmation ----------------------------------- */}
      <Dialog open={Boolean(bulk)} onOpenChange={(open) => !open && setBulk(null)}>
        <DialogContent
          data-testid="bulk-confirm"
          className="max-w-[calc(100vw-2rem)] overflow-hidden sm:max-w-lg"
        >
          <DialogHeader>
            <DialogTitle>{bulk ? BULK_COPY[bulk].title : ""}</DialogTitle>
            <DialogDescription>
              This affects <strong>{selected.length}</strong>{" "}
              {selected.length === 1 ? "account" : "accounts"}.{" "}
              {bulk ? BULK_COPY[bulk].description : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bulk-reason" className="text-xs">
              Reason {bulkNeedsReason ? "(required)" : "(optional)"}
            </Label>
            <Textarea
              id="bulk-reason"
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              placeholder="Stored in the audit log and sent to each member"
              rows={3}
            />
            {bulkNeedsReason && !reasonValid(bulkReason) ? (
              <p className="text-[11px] text-muted-foreground">
                At least {MIN_REASON} characters required.
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulk(null)}>
              Cancel
            </Button>
            <Button
              variant={bulk === "unsuspend" ? "default" : "destructive"}
              data-testid="bulk-confirm-run"
              disabled={busy === "bulk" || (bulkNeedsReason && !reasonValid(bulkReason))}
              onClick={() => void onBulkRun()}
            >
              {bulk ? `${BULK_COPY[bulk].label} (${selected.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
