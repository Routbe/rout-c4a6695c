import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Camera, Check, Copy, KeyRound, Loader2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { parseClaimInput } from "@/lib/agent/agent-sandbox";
import { claimState } from "@/lib/agent/agent-claims";
import { claimAgentWorkspace, previewAgentWorkspaceClaim } from "@/lib/agent/agent-claims.functions";
import { parseHandoffCode } from "@/lib/vault/handoff-code";
import { VaultClaim } from "@/components/vault/VaultClaim";

export const Route = createFileRoute("/_authenticated/studio_/workspaces/claim")({
  head: () => ({
    meta: [
      { title: "Workspace claimen | ROUT" },
      { name: "description", content: "Claim een workspace die een AI-agent voor je bouwde: scan de QR-code of typ de claimcode." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Workspace claimen | ROUT" },
      { property: "og:description", content: "Claim een workspace die een AI-agent voor je bouwde." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClaimWorkspaceHub,
});

type Input = { token: string } | { code: string };
type Preview = Awaited<ReturnType<typeof previewAgentWorkspaceClaim>>;
type Done = Awaited<ReturnType<typeof claimAgentWorkspace>>;

type Detector = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

function ClaimWorkspaceHub() {
  const preview = useServerFn(previewAgentWorkspaceClaim);
  const claim = useServerFn(claimAgentWorkspace);
  const [raw, setRaw] = useState("");
  const [input, setInput] = useState<Input | null>(null);
  const [info, setInfo] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [scanning, setScanning] = useState(false);
  const [canScan, setCanScan] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [vault, setVault] = useState<{ vaultId: string; secret: string } | null>(null);

  useEffect(() => {
    setCanScan(typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia);
    // Handoff links carry the code in the fragment (never sent to the server); strip it from the address bar.
    const fromHash = parseHandoffCode(window.location.hash);
    if (fromHash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setVault(fromHash);
    }
  }, []);

  async function check(value: string) {
    setError(null);
    const handoff = parseHandoffCode(value);
    if (handoff) {
      setRaw("");
      setVault(handoff);
      return;
    }
    const parsed = parseClaimInput(value);
    if (!parsed) {
      setError("Dit is geen geldige claimcode of claim-link. Controleer elk teken.");
      return;
    }
    const data: Input = parsed.kind === "token" ? { token: parsed.token } : { code: parsed.code };
    setBusy(true);
    try {
      const p = await preview({ data });
      if (!p) {
        setError("Deze claim bestaat niet (meer).");
        return;
      }
      const st = claimState(p);
      if (st === "claimed") setError("Deze workspace is al geclaimd.");
      else if (st === "expired") setError("Deze claim is verlopen. Ongeclaimde workspaces worden na 24 uur verwijderd.");
      else {
        setInput(data);
        setInfo(p);
      }
    } catch {
      setError("Controleren mislukt. Probeer het zo opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (!input) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await claim({ data: input }));
    } catch (err) {
      const m = err instanceof Error ? err.message : "";
      setError(m.includes("claim_used") ? "Deze workspace is al geclaimd." : m.includes("claim_expired") ? "Deze claim is verlopen." : "Claimen mislukt. Probeer opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let stop = false;
    const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
    const detector = new Ctor({ formats: ["qr_code"] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        while (!stop) {
          const codes = await detector.detect(v).catch(() => []);
          const hit = codes[0]?.rawValue;
          if (hit) {
            stop = true;
            setScanning(false);
            setRaw(hit);
            void check(hit);
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setScanning(false);
        toast.error("Geen toegang tot de camera. Typ de code in plaats daarvan.");
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  if (done) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col items-center gap-5 px-4 py-12 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-full border-2 border-accent/60">
          <Check className="h-10 w-10 text-accent" aria-hidden />
        </div>
        <h1 className="font-display text-3xl">Workspace geclaimd!</h1>
        <p className="text-muted-foreground">Je bent nu eigenaar. Alles wat de AI bouwde staat klaar; het profiel gaat pas live als jij het publiceert.</p>
        {done.apps.length > 0 && (
          <section className="w-full space-y-3 rounded-xl border border-border p-4 text-left">
            <h2 className="font-medium">Login-apps — bewaar deze geheimen nu</h2>
            <p className="text-xs text-muted-foreground">Ze worden maar één keer getoond. Kwijt? Maak in de ontwikkelaarsconsole een nieuw geheim aan.</p>
            {done.apps.map((a) => (
              <div key={a.clientId} className="space-y-1 rounded-lg bg-muted p-3 font-mono text-xs">
                <div className="font-sans text-sm font-medium">{a.name}</div>
                <div className="break-all">client_id: {a.clientId}</div>
                <div className="flex items-start gap-2">
                  <span className="break-all">secret: {a.clientSecret}</span>
                  <button
                    type="button"
                    aria-label="Geheim kopiëren"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => void navigator.clipboard.writeText(a.clientSecret).then(() => toast.success("Gekopieerd"))}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
        <Button asChild>
          <Link to="/w/$slug" params={{ slug: done.slug }}>Open je workspace</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-12">
      <header className="space-y-2 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border-2 border-dashed border-primary/60">
          <Bot className="h-8 w-8 text-primary" aria-hidden />
        </div>
        <h1 className="font-display text-3xl">Workspace claimen</h1>
        <p className="text-sm text-muted-foreground">Heeft een AI-agent een workspace voor je gebouwd? Scan de QR-code of typ de claimcode die je kreeg.</p>
      </header>

      {vault ? (
        <VaultClaim vaultId={vault.vaultId} secret={vault.secret} onCancel={() => setVault(null)} />
      ) : info && input ? (
        <section className="space-y-4 rounded-xl border border-border p-5 text-center">
          <h2 className="font-display text-2xl">{info.name}</h2>
          <p className="text-sm text-muted-foreground">
            {info.appName ? `De AI-agent “${info.appName}” heeft` : "Een AI-agent heeft"} deze workspace ingericht. Geldig tot {new Date(info.expiresAt).toLocaleString("nl-NL")}.
          </p>
          {error && <p role="alert" className="rounded-lg bg-muted px-4 py-2 text-sm">{error}</p>}
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => { setInfo(null); setInput(null); }} disabled={busy}>Annuleren</Button>
            <Button onClick={() => void accept()} disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Claim workspace
            </Button>
          </div>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Eenmalig — na het claimen verliest de AI zijn sandbox-sleutel.
          </p>
        </section>
      ) : (
        <section className="space-y-4">
          {scanning ? (
            <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
              <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
              <Button size="icon" variant="secondary" className="absolute right-2 top-2" aria-label="Scannen stoppen" onClick={() => setScanning(false)}>
                <X />
              </Button>
            </div>
          ) : (
            <Button className="w-full" variant="outline" onClick={() => setScanning(true)} disabled={!canScan || busy}>
              <Camera aria-hidden /> {canScan ? "QR-code scannen" : "QR scannen niet beschikbaar in deze browser"}
            </Button>
          )}
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void check(raw);
            }}
          >
            <label htmlFor="claim-code" className="flex items-center gap-2 text-sm font-medium">
              <KeyRound className="h-4 w-4" aria-hidden /> Claimcode of claim-link
            </label>
            <Textarea
              id="claim-code"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="ROUT-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX of rvh1_…"
              autoComplete="off"
              spellCheck={false}
              maxLength={300}
              className="font-mono"
              rows={3}
            />
            {error && <p role="alert" className="rounded-lg bg-muted px-4 py-2 text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !raw.trim()}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Claim workspace
            </Button>
          </form>
          <p className="text-center text-xs text-muted-foreground">
            Hoe werkt dit? <Link to="/about/ai-agents" className="underline">Workspaces gebouwd door AI</Link>
          </p>
        </section>
      )}
    </main>
  );
}
