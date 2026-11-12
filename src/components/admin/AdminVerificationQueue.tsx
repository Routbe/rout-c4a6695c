import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Ban, Check, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { StatusBadge } from "@/components/admin/AdminPrimitives";
import { euro } from "@/lib/profile";
import { adminToastError, TIER_BADGE } from "@/lib/admin-format";
import { logQuietly } from "@/lib/notify";
import { parseRoutReference } from "@/lib/reference-parser";
import {
  approveVerification,
  listIncompletePayments,
  listPendingVerifications,
  matchPaymentReference,
  resolveIncompletePayment,
  setVerificationStatus,
  suggestHandlesForBankName,
} from "@/lib/admin.functions";
import type { Pending } from "@/types/admin";
import { i18n as trI18n } from "@/lib/i18n";

export function AdminVerificationQueue({
  allowed,
  refreshTx,
  refreshAudit,
}: {
  allowed: boolean;
  refreshTx: (page?: number) => void | Promise<void>;
  refreshAudit: (cursor?: string | null) => void | Promise<void>;
}) {
  const loadPending = useServerFn(listPendingVerifications);
  const loadIncomplete = useServerFn(listIncompletePayments);
  const approve = useServerFn(approveVerification);
  const resolveIncomplete = useServerFn(resolveIncompletePayment);
  const setStatus = useServerFn(setVerificationStatus);
  const suggestHandles = useServerFn(suggestHandlesForBankName);
  const matchReference = useServerFn(matchPaymentReference);

  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [incomplete, setIncomplete] = useState<Pending[]>([]);
  const [incompleteBusy, setIncompleteBusy] = useState<string | null>(null);
  const [incompleteReason, setIncompleteReason] = useState("");
  const [rejecting, setRejecting] = useState<Pending | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankSuggestions, setBankSuggestions] = useState<string[]>([]);
  const [bankMessage, setBankMessage] = useState("");
  const [referenceMatch, setReferenceMatch] = useState<Awaited<
    ReturnType<typeof matchPaymentReference>
  > | null>(null);
  const [referenceMatching, setReferenceMatching] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    void loadPending({}).then(setPending);
    void loadIncomplete({}).then(setIncomplete);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const pendingActionable = pending.filter((p) => p.status !== "paid");

  const onApprove = async (row: Pending) => {
    setBusy(row.paymentId);
    try {
      const res = await approve({ data: { paymentId: row.paymentId } });
      if (!res.ok) throw new Error("failed");
      toast.success(
        `Badge granted — "Your ROUT verification is live!" sent to ${row.email ?? "the user"}`,
      );
      setPending((prev) =>
        prev.map((p) => (p.paymentId === row.paymentId ? { ...p, status: "paid" } : p)),
      );
      void refreshTx(1);
      void refreshAudit(null);
    } catch (error) {
      adminToastError(error, "Could not approve this payment.");
    } finally {
      setBusy(null);
    }
  };

  const onSetStatus = async (paymentId: string, status: "pending" | "failed", reason?: string) => {
    setBusy(paymentId);
    try {
      const res = await setStatus({ data: { paymentId, status, reason } });
      if (!res.ok) throw new Error("failed");
      setPending((prev) => prev.map((p) => (p.paymentId === paymentId ? { ...p, status } : p)));
      toast.success(status === "failed" ? "Payment marked as failed." : "Payment reopened.");
      void refreshTx();
      void refreshAudit(null);
    } catch (error) {
      adminToastError(error, "Could not update this payment.");
    } finally {
      setBusy(null);
      setRejecting(null);
      setRejectReason("");
    }
  };

  const onResolveIncomplete = async (
    row: Pending,
    action: "approve" | "fail" | "retry",
    reason?: string,
  ) => {
    setIncompleteBusy(row.paymentId);
    try {
      const res = await resolveIncomplete({ data: { paymentId: row.paymentId, action, reason } });
      if (!res.ok) throw new Error(res.reason);
      const nextStatus = action === "approve" ? "paid" : action === "fail" ? "failed" : "pending";
      setIncomplete((prev) =>
        prev.map((p) => (p.paymentId === row.paymentId ? { ...p, status: nextStatus } : p)),
      );
      toast.success(
        action === "approve"
          ? `Badge granted — verification activated for ${row.email ?? "the user"}.`
          : action === "fail"
            ? "Payment marked as failed."
            : "Payment reset to pending for customer retry.",
      );
      void refreshTx();
      void refreshAudit(null);
    } catch (error) {
      adminToastError(error, "Could not resolve this incomplete payment.");
    } finally {
      setIncompleteBusy(null);
      setIncompleteReason("");
    }
  };

  const onBankMatch = async () => {
    if (bankName.trim().length < 2) return;
    try {
      const res = await suggestHandles({ data: { bankName } });
      setBankSuggestions(res.suggestions);
      if (res.suggestions.length === 0) toast.info(trI18n.t("ui.86093f89ad"));
    } catch {
      toast.error(trI18n.t("ui.d00588ec3e"));
    }
  };

  /** Auto-parses a `ROUT-XXXXXX` reference out of a pasted bank message and pre-fills the match. */
  const onBankMessageChange = (value: string) => {
    setBankMessage(value);
    const parsed = parseRoutReference(value);
    if (!parsed) {
      setReferenceMatch(null);
      return;
    }
    setReferenceMatching(true);
    matchReference({ data: { text: value } })
      .then(setReferenceMatch)
      .catch((error) => logQuietly("admin:reference-match", error))
      .finally(() => setReferenceMatching(false));
  };
  // bankMessage / referenceMatch state is intentionally kept even though this
  // handler is not currently wired to a visible input — preserves prior behaviour.
  void onBankMessageChange;
  void referenceMatching;
  void referenceMatch;

  return (
    <>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4 pb-6 sm:p-5">
        <h2 className="text-lg font-medium">Bank name → handle matching</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[16rem] flex-1 space-y-1">
            <Label htmlFor="bank-name" className="text-xs">
              Name on the SEPA transfer
            </Label>
            <Input
              id="bank-name"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Jona De Vries"
              className="h-9"
            />
          </div>
          <Button className="h-9" onClick={onBankMatch}>
            Generate handles
          </Button>
        </div>
        {bankSuggestions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {bankSuggestions.map((s) => (
              <span key={s} className="rounded-full bg-muted px-2.5 py-1 font-mono text-xs">
                @{s}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4 pb-6 sm:p-5">
        <h2 className="text-lg font-medium">
          Pending verifications ({pendingActionable.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting for approval.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Reference</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {pending.map((row) => (
                  <tr key={row.paymentId} className="border-t border-border/60 align-top">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{row.displayName ?? "Unnamed"}</div>
                      <div className="font-mono text-[11px] text-foreground">
                        @{row.username ?? "—"}
                      </div>
                      <div className="break-all text-muted-foreground">
                        {row.email ?? `${row.userId.slice(0, 8)}…${row.userId.slice(-4)}`}
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase">
                        {TIER_BADGE[row.tier] ?? row.tier}
                      </span>
                      {(row.duplicates ?? 1) > 1 && (
                        <span className="ml-1 whitespace-nowrap rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary" title="Duplicates close automatically on approve">
                          {row.duplicates}× requests
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono">{row.reference}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {euro(row.amountCents + row.donationCents)}
                    </td>

                    <td className="py-2 pr-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {row.status === "paid" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Check className="h-3.5 w-3.5" aria-hidden /> Approved
                          </span>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              className="h-8"
                              disabled={busy === row.paymentId}
                              onClick={() => onApprove(row)}
                            >
                              {busy === row.paymentId ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <BadgeCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                              )}
                              Approve &amp; grant badge
                            </Button>
                            {row.status === "failed" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                disabled={busy === row.paymentId}
                                onClick={() => onSetStatus(row.paymentId, "pending")}
                              >
                                <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                Reopen
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-destructive"
                                disabled={busy === row.paymentId}
                                onClick={() => {
                                  setRejectReason("");
                                  setRejecting(row);
                                }}
                              >
                                <Ban className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                Reject
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4 pb-6 sm:p-5">
        <h2 className="text-lg font-medium">
          Incomplete Stripe payments ({incomplete.length})
        </h2>
        {incomplete.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No incomplete payments waiting for resolution.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Reference</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {incomplete.map((row) => (
                  <tr key={row.paymentId} className="border-t border-border/60 align-top">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{row.displayName ?? "Unnamed"}</div>
                      <div className="font-mono text-[11px] text-foreground">
                        @{row.username ?? "—"}
                      </div>
                      <div className="break-all text-muted-foreground">
                        {row.email ?? `${row.userId.slice(0, 8)}…${row.userId.slice(-4)}`}
                      </div>
                    </td>
                    <td className="py-2 pr-3 font-mono">{row.reference}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {euro(row.amountCents + row.donationCents)}
                    </td>
                    <td className="py-2 pr-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button
                          size="sm"
                          className="h-8"
                          disabled={incompleteBusy === row.paymentId}
                          onClick={() => onResolveIncomplete(row, "approve")}
                        >
                          {incompleteBusy === row.paymentId ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <BadgeCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                          )}
                          Approve &amp; grant badge
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={incompleteBusy === row.paymentId}
                          onClick={() => onResolveIncomplete(row, "retry")}
                        >
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                          Retry
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-destructive"
                          disabled={incompleteBusy === row.paymentId}
                          onClick={() => {
                            setIncompleteReason("");
                            onResolveIncomplete(row, "fail", incompleteReason || undefined);
                          }}
                        >
                          <Ban className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                          Mark failed
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this payment?</DialogTitle>
            <DialogDescription>
              The member is notified by e-mail. No badge is granted.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason (optional) — shown to the member"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                rejecting && onSetStatus(rejecting.paymentId, "failed", rejectReason || undefined)
              }
            >
              Reject payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
