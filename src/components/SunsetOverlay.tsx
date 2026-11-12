import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2 } from "lucide-react";
import { getSunsetStatus } from "@/lib/workspace-conversion.functions";
import { daysLeft } from "@/lib/workspace-conversion-rules";

/**
 * Notice for logins of accounts that became a Workspace. The account keeps working
 * (as admin of the new workspace) until the sunset date; this bar only counts down.
 */
export function SunsetOverlay() {
  const fn = useServerFn(getSunsetStatus);
  const { data } = useQuery({ queryKey: ["sunset-status"], queryFn: () => fn(), staleTime: 60_000 });
  if (!data) return null;
  const date = data.sunsetAt ? new Date(data.sunsetAt).toLocaleDateString("nl-BE", { day: "numeric", month: "long", year: "numeric" }) : "";
  const left = data.sunsetAt ? daysLeft(data.sunsetAt, new Date()) : null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-card/95 px-4 py-3 text-card-foreground backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 text-sm">
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 flex-1">
          Dit account is omgezet naar {data.workspaceName ? <strong>{data.workspaceName}</strong> : "een Workspace"}. Je kunt er nog
          {left !== null ? ` ${left} ${left === 1 ? "dag" : "dagen"}` : ""} mee werken{date ? `, tot ${date}` : ""}. Daarna log je in met je persoonlijke account.
        </p>
      </div>
    </div>
  );
}
