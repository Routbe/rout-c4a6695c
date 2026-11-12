import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/** Only an explicit "Forbidden" from the server means no access; anything else is a loading failure. */
export function isForbidden(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return /forbidden|geen toegang/i.test(msg);
}

/** Clear message plus a way forward, instead of a dead end. */
export function ScopeActivationState({ kind, onRetry }: { kind: "denied" | "error"; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-border bg-card p-6 text-center">
      <h2 className="font-medium">{kind === "denied" ? "Geen toegang tot deze workspace" : "Workspace kon niet laden"}</h2>
      <p className="text-sm text-muted-foreground">
        {kind === "denied"
          ? "Je bent geen lid van deze workspace, of het adres klopt niet. Vraag een eigenaar of admin om je uit te nodigen."
          : "Er ging iets mis bij het openen. Je hebt waarschijnlijk wel toegang: probeer het opnieuw."}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {kind === "error" && <Button size="sm" onClick={onRetry}>Opnieuw proberen</Button>}
        <Button asChild size="sm" variant="outline">
          <Link to="/studio" search={{ mode: undefined, type: undefined, url: undefined, workspace: undefined }}>Terug naar mijn Studio</Link>
        </Button>
      </div>
    </div>
  );
}
