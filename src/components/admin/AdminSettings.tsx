import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmailFlowTester } from "@/components/admin/EmailFlowTester";
import { DeliveryMonitorPanel } from "@/components/admin/DeliveryMonitorPanel";
import { PricingPanel } from "@/components/admin/PricingPanel";
import { describeAdminError } from "@/lib/admin-errors";
import { retentionLabel } from "@/lib/export-retention";
import { getDeploymentChecklist } from "@/lib/admin.functions";

type Checklist = Awaited<ReturnType<typeof getDeploymentChecklist>>;

/** The `pricing`, `delivery` and `deployment` settings tabs. */
export function AdminSettings({
  section,
  userEmail,
}: {
  section: "pricing" | "delivery" | "deployment";
  userEmail?: string;
}) {
  if (section === "pricing") return <PricingPanel />;
  if (section === "delivery") return <DeliveryMonitorPanel />;
  return <DeploymentChecklist userEmail={userEmail} />;
}

function DeploymentChecklist({ userEmail }: { userEmail?: string }) {
  const loadChecklist = useServerFn(getDeploymentChecklist);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistError, setChecklistError] = useState<string | null>(null);

  /** Configuration self-check — never throws, always renders a status. */
  const loadChecklistNow = useCallback(async () => {
    setChecklistLoading(true);
    setChecklistError(null);
    try {
      setChecklist(await loadChecklist());
    } catch (error) {
      const info = describeAdminError(error, "Could not read the deployment status.");
      setChecklistError(`${info.title} — ${info.description}`);
    } finally {
      setChecklistLoading(false);
    }
  }, [loadChecklist]);

  useEffect(() => {
    void loadChecklistNow();
  }, [loadChecklistNow]);

  return (
    <>
      <EmailFlowTester defaultEmail={userEmail ?? ""} />

      <section
        className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5"
        data-testid="deployment-checklist"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Deployment checklist</h2>
            <p className="text-xs text-muted-foreground">
              Backend configuration required by the admin portal.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={checklistLoading}
            onClick={() => void loadChecklistNow()}
          >
            {checklistLoading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : null}
            Re-check
          </Button>
        </div>

        {checklistError ? (
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            {checklistError}
          </p>
        ) : null}

        {checklist ? (
          <>
            <p
              className={`rounded-xl border p-3 text-xs ${
                checklist.ok
                  ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-600"
                  : "border-amber-500/40 bg-amber-500/5 text-amber-600"
              }`}
            >
              {checklist.ok
                ? "All required secrets are configured and the privileged key works."
                : (checklist.serviceRoleError ?? "One or more required secrets are missing.")}
            </p>
            <ul className="space-y-2">
              {checklist.items.map((item) => (
                <li
                  key={item.name}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border p-3"
                  data-testid={`checklist-${item.name}`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium">
                      {item.label}{" "}
                      <code className="text-[11px] text-muted-foreground">{item.name}</code>
                    </p>
                    <p className="text-[11px] text-muted-foreground">{item.hint}</p>
                    {item.preview ? (
                      <p className="text-[11px] text-muted-foreground">{item.preview}</p>
                    ) : null}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                      item.present
                        ? "bg-emerald-500/10 text-emerald-600"
                        : item.required
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {item.present ? "Configured" : item.required ? "Missing" : "Optional"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground">
              Last checked {new Date(checklist.checkedAt).toLocaleString()} ·{" "}
              {retentionLabel()}
            </p>
          </>
        ) : checklistLoading ? (
          <p className="text-xs text-muted-foreground">Checking configuration…</p>
        ) : null}
      </section>
    </>
  );
}
