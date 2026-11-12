import { Check, Minus } from "lucide-react";
import { ROLE_LABELS, WORKSPACE_ROLES, canEditWorkspaceHub, canManageTeam, canUseDeveloperTools, type WorkspaceRole } from "@/lib/workspace-rules";

/** Rows come from the same rule functions the server enforces, so this table cannot drift. */
const ROWS: { label: string; allowed: (r: WorkspaceRole) => boolean }[] = [
  { label: "Workspace bekijken", allowed: () => true },
  { label: "Profiel Hub & Studio bewerken", allowed: (r) => canEditWorkspaceHub(r) },
  { label: "Apps, API-sleutels & webhooks", allowed: (r) => canUseDeveloperTools(r) },
  { label: "Leden uitnodigen & rollen geven", allowed: (r) => canManageTeam(r) },
  { label: "Workspace verwijderen", allowed: (r) => r === "owner" },
];

export function RolesOverview({ myRole }: { myRole: WorkspaceRole }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-medium">Rollen &amp; rechten</h2>
      <p className="text-sm text-muted-foreground">Jouw rol: <strong className="text-foreground">{ROLE_LABELS[myRole]}</strong>. Wat elke rol mag:</p>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2 pr-2 font-medium">Recht</th>
              {WORKSPACE_ROLES.map((r) => <th key={r} className="px-1 py-2 text-center font-medium">{ROLE_LABELS[r]}</th>)}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-t border-border">
                <td className="py-2 pr-2">{row.label}</td>
                {WORKSPACE_ROLES.map((r) => (
                  <td key={r} className="px-1 py-2 text-center">
                    {row.allowed(r) ? <Check className="mx-auto h-4 w-4 text-primary" aria-label="ja" /> : <Minus className="mx-auto h-4 w-4 text-muted-foreground" aria-label="nee" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
