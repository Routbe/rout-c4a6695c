import { Copy } from "lucide-react";
import { toast } from "sonner";
import { profileLabels } from "@/lib/app-domains";
import { i18n as trI18n } from "@/lib/i18n";

/**
 * One handle, two namespaces. Shows that a member owns both
 * `rout.be/@handle` and `dlp.li/handle`, with 1-click copy on each.
 */
export function NamespaceOwnership({ handle }: { handle: string }) {
  const clean = handle.trim().replace(/^@/, "").toLowerCase();
  if (!clean) return null;

  return (
    <ul className="space-y-2">
      {profileLabels(clean).map(({ domain, label, url }) => (
        <li
          key={domain}
          className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/40 px-4 py-3"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">{label}</span>
          <button
            type="button"
            aria-label={`Copy ${label}`}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => {
              void navigator.clipboard.writeText(url);
              toast.success(trI18n.t("ui.88fe9d214a"));
            }}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
