import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AtSign, CheckCircle2, Clock, Copy, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { APP_DOMAINS, aliasAddress, type AppDomain } from "@/lib/app-domains";
import { getMyEmailAliases, setMyEmailAliases } from "@/lib/email-aliases.functions";
import { i18n as trI18n } from "@/lib/i18n";

/**
 * Domain picker for the personal e-mail alias: `handle@rout.be`,
 * `handle@dlp.li`, or both. Quiet by design — two switches, one save,
 * 1-click copy per address.
 */
export function EmailAliasDomains() {
  const load = useServerFn(getMyEmailAliases);
  const save = useServerFn(setMyEmailAliases);

  const [handle, setHandle] = useState<string | null>(null);
  const [selected, setSelected] = useState<AppDomain[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [forwardTo, setForwardTo] = useState<string | null>(null);
  const [forwardVerified, setForwardVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const state = await load({});
        if (cancelled) return;
        setHandle(state.handle);
        setSelected(state.domains);
        setForwardTo(state.forwardTo);
        setForwardVerified(state.forwardVerified);
        setStatuses(Object.fromEntries(state.aliases.map((a) => [a.domain, a.status])));
      } catch {
        /* table not provisioned yet — keep the empty state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (loading || !handle) return null;

  const toggle = (domain: AppDomain, on: boolean) =>
    setSelected((prev) =>
      on ? [...new Set([...prev, domain])] : prev.filter((d) => d !== domain),
    );

  const persist = async () => {
    setSaving(true);
    const result = await save({ data: { domains: selected } });
    setSaving(false);
    if (!result.ok) {
      toast.error(
        result.reason === "unconfirmed_forward"
          ? "Confirm your forwarding address first."
          : result.reason === "no_forward"
            ? "Set a forwarding address first."
            : result.reason === "not_entitled"
              ? "Aliases are for verified members."
              : "Could not save your aliases.",
      );
      return;
    }
    setStatuses(Object.fromEntries(result.state.aliases.map((a) => [a.domain, a.status])));
    toast.success(trI18n.t("ui.bb479963e0"));
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight sm:text-lg">
          <AtSign className="h-4 w-4" aria-hidden /> Alias domains
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Choose which addresses reach you. Mail is forwarded to{" "}
          <span className="font-mono">{forwardTo ?? "your private inbox"}</span>
          {forwardVerified ? "" : " once that address is confirmed"}.
        </p>
      </div>

      <div className="space-y-2">
        {APP_DOMAINS.map((domain) => {
          const address = aliasAddress(handle, domain);
          const on = selected.includes(domain);
          const status = statuses[domain];
          return (
            <div
              key={domain}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-sm">{address}</span>
              {on && status === "active" && (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" aria-hidden /> Active
                </span>
              )}
              {on && status === "pending" && (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                  <Clock className="h-3 w-3" aria-hidden /> Pending
                </span>
              )}
              {on && status === "failed" && (
                <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
                  <TriangleAlert className="h-3 w-3" aria-hidden /> Failed
                </span>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-lg"
                onClick={() => {
                  void navigator.clipboard.writeText(address);
                  toast.success(trI18n.t("ui.f6d516c2b3"));
                }}
              >
                <Copy className="mr-1 h-3 w-3" /> Copy
              </Button>
              <Switch
                checked={on}
                onCheckedChange={(value) => toggle(domain, value)}
                aria-label={`Receive mail on ${address}`}
              />
            </div>
          );
        })}
      </div>

      <Button type="button" className="h-10 rounded-xl" disabled={saving} onClick={persist}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save alias routing
      </Button>
    </section>
  );
}
