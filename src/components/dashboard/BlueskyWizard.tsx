import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, AtSign, Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import {
  getMySubdomainSettings,
  linkBlueskyHandle,
  testAtprotoDid,
} from "@/lib/subdomain.functions";
import { cn } from "@/lib/utils";
import { i18n as trI18n } from "@/lib/i18n";

type Health = "idle" | "checking" | "ok" | "fail";

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
          done ? "border-foreground bg-foreground text-background" : "border-border",
        )}
      >
        {done ? <Check className="h-3 w-3" aria-hidden /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

/**
 * Bluesky handle wizard (NL): koppel je Bluesky-account, zet je actieve
 * ROUT-subdomein als handle en controleer of `/.well-known/atproto-did` leeft.
 */
export function BlueskyWizard() {
  const { user } = useAuth();
  const load = useServerFn(getMySubdomainSettings);
  const link = useServerFn(linkBlueskyHandle);
  const check = useServerFn(testAtprotoDid);

  const [handle, setHandle] = useState("");
  const [did, setDid] = useState<string | null>(null);
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [tier, setTier] = useState<"free" | "pro" | "root_lifetime">("free");
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<Health>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const data = await load({});
      if (cancelled) return;
      setDid(data.blueskyDid);
      setHandle(data.blueskyHandle ?? "");
      setSubdomain(data.activeSubdomain);
      setTier(data.tier);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, load]);

  /** Altijd een kale host: geen scheme, geen slashes, geen pad. */
  const bareDomain = (subdomain ?? "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "");

  const onLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await link({ data: { handle } });
      if (res.ok) {
        setDid(res.did);
        toast.success(`DID opgehaald voor @${res.handle}`);
      } else {
        setError(res.error);
        toast.error(res.error);
      }
    } catch {
      setError("Kon de Bluesky-directory niet bereiken.");
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    if (!bareDomain) return;
    setHealth("checking");
    try {
      const res = await check({ data: { handle: bareDomain } });
      setHealth(res.ok && (!did || res.body === did) ? "ok" : "fail");
    } catch {
      setHealth("fail");
    }
  };

  const tierLabel = tier === "root_lifetime" ? "Root-subdomein" : tier === "pro" ? "Pro" : "Gratis";

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <AtSign className="h-4 w-4" aria-hidden /> Bluesky-handle wizard
      </h2>
      <div className="rounded-xl border border-border p-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Actief subdomein ({tierLabel})
        </p>
        <p className="mt-1 break-all font-mono text-sm text-foreground">
          {bareDomain ? `https://${bareDomain}` : "Claim eerst een handle"}
        </p>
      </div>

      <ol className="space-y-4">
        <Step n={1} title="Stap 1: Koppel je Bluesky account" done={Boolean(did)}>
          <div className="flex flex-wrap gap-2">
            <Input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="naam.bsky.social"
              className="input-field h-10 min-w-0 flex-1 rounded-xl"
              aria-label="Huidige Bluesky handle"
            />
            <Button
              type="button"
              className="h-10 w-full rounded-xl sm:w-auto"
              disabled={busy || handle.trim().length < 3}
              onClick={onLink}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Haal DID op
            </Button>
          </div>
          {error && (
            <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}
          {did && (
            <p className="break-all font-mono text-[11px] text-muted-foreground">
              Opgeslagen DID: {did}
            </p>
          )}
        </Step>

        <Step n={2} title="Stap 2: Stel je domein in op Bluesky" done={Boolean(did)}>
          <p className="text-xs text-muted-foreground">
            Ga in de Bluesky app naar{" "}
            <strong>Instellingen → Handle → Ik heb mijn eigen domein</strong>. Kies de optie{" "}
            <strong>Geen DNS-paneel / HTTP-bestand</strong>.
          </p>
          <div className="flex items-start gap-1.5">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-border bg-muted p-2 font-mono text-[11px]">
              {bareDomain || "handle.rout.be"}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 rounded-lg text-xs"
              disabled={!bareDomain}
              onClick={() => {
                void navigator.clipboard.writeText(bareDomain);
                toast.success(trI18n.t("ui.2c8352ce9a"));
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Kopieer domein
            </Button>
          </div>
        </Step>

        <Step n={3} title="Stap 3: Controleer verificatie" done={health === "ok"}>
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full rounded-xl sm:w-auto"
            disabled={health === "checking" || !bareDomain}
            onClick={onVerify}
          >
            {health === "checking" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Test verificatie
          </Button>
          {health === "ok" && (
            <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-foreground">
              ✓ Subdomein is live &amp; geverifieerd voor Bluesky! Je kunt je handle nu afronden in
              de Bluesky app.
            </p>
          )}
          {health === "fail" && (
            <p
              role="alert"
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-foreground"
            >
              ⚠️ Subdomein of DNS nog niet verwerkt. Probeer het over enkele minuten opnieuw.
            </p>
          )}
        </Step>
      </ol>
    </section>
  );
}
