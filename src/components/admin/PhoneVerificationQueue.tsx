import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { adminApprovePhoneVerification, adminListPhoneVerifications } from "@/lib/admin-ops.functions";
import { i18n as trI18n } from "@/lib/i18n";

/** Admin Ops: handmatige goedkeuring van openstaande telefoonverificaties. */
export function PhoneVerificationQueue() {
  const qc = useQueryClient();
  const list = useServerFn(adminListPhoneVerifications);
  const approve = useServerFn(adminApprovePhoneVerification);
  const q = useQuery({ queryKey: ["admin-phone-queue"], queryFn: () => list(), retry: false });

  async function onApprove(id: string) {
    try {
      const r = await approve({ data: { id } });
      if (r.ok) toast.success(trI18n.t("ui.bbaa30b19e"));
      else toast.error(trI18n.t("ui.6538fa3771"));
      await qc.invalidateQueries({ queryKey: ["admin-phone-queue"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Goedkeuren mislukt");
    }
  }

  return (
    <section className="mb-6 space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <Phone className="h-4 w-4" aria-hidden /> Openstaande Telefoonverificaties
      </h2>
      {q.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : !q.data || q.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen openstaande aanvragen.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {q.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className="font-mono">{r.masked}</span>
              <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">{r.attempts} pogingen</span>
              <Button size="sm" className="ml-auto gap-1" onClick={() => onApprove(r.id)}>
                <Check className="h-4 w-4" /> Handmatig Goedkeuren
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
