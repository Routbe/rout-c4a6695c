import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BadgeCheck, Copy, GitMerge, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { previewAccountMerge, redeemAccountMerge, startAccountMerge } from "@/lib/account-merge.functions";
import { cn } from "@/lib/utils";
import { withStepUp } from "@/components/auth/StepUpDialog";
import { i18n as trI18n } from "@/lib/i18n";

type Role = "primary" | "secondary";
type Side = "primary" | "secondary";
type Summary = {
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  verified: boolean;
  email: string | null;
  providers: string[];
};

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google", apple: "Apple", github: "GitHub", gitlab: "GitLab", microsoft: "Microsoft",
  infomaniak: "Infomaniak", oidc: "ROUT ID", bluesky: "Bluesky", mastodon: "Mastodon", discord: "Discord", linkedin: "LinkedIn",
};

const ERRORS: Record<string, string> = {
  same_account: "Deze code hoort bij dit account zelf. Gebruik hem op je tweede account.",
  bad_code: "De code uit je e-mail klopt niet of is verlopen.",
  rate_limited: "Te veel aanvragen. Probeer het later opnieuw.",
  no_email: "Dit account heeft geen e-mailadres om de code naar te sturen.",
  blocked: "Dit account heeft een identiteitsbewijs, wallet of betaalgegevens. Samenvoegen kan daarom niet automatisch.",
  failed: "Samenvoegen is mislukt. Er is niets gewijzigd; probeer het opnieuw.",
};

function AccountCard({ s, label }: { s: Summary; label: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        {s.avatarUrl ? <img src={s.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="h-9 w-9 rounded-full bg-muted" />}
        <div className="min-w-0">
          <p className="flex items-center gap-1 truncate text-sm font-medium">
            {s.displayName ?? "—"} {s.verified && <BadgeCheck className="h-4 w-4 text-primary" aria-label="Geverifieerd" />}
          </p>
          <p className="truncate text-xs text-muted-foreground">{s.handle ? `@${s.handle}` : "geen handle"} · {s.email ?? ""}</p>
        </div>
      </div>
      {s.providers.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Gekoppeld: {s.providers.map((p) => PROVIDER_LABEL[p] ?? p).join(", ")}
        </p>
      )}
    </div>
  );
}

function Choice({ value, onChange, options, title }: {
  value: Side; onChange: (v: Side) => void; title: string; options: { side: Side; label: string; hint?: string }[];
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{title}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <button key={o.side} type="button" aria-pressed={value === o.side} onClick={() => onChange(o.side)}
            className={cn("rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
              value === o.side ? "border-foreground bg-muted/60" : "border-border text-muted-foreground hover:bg-muted/40")}>
            <span className="block font-medium text-foreground">{o.label}</span>
            {o.hint && <span className="block text-xs">{o.hint}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Account merge.
 * Kept account: makes a 5-minute pin + QR.
 * Other account: enters the pin, sees both accounts, gets an e-mail code,
 * chooses handle + design, and confirms. Everything moves to the kept account.
 */
export function MergeAccountWizard() {
  const { t } = useI18n();
  const [role, setRole] = useState<Role>("primary");
  const [ticket, setTicket] = useState<{ pin: string; qrPayload: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [pin, setPin] = useState("");
  const [preview, setPreview] = useState<{ primary: Summary; secondary: Summary; codeSentTo: string } | null>(null);
  const [code, setCode] = useState("");
  const [keepHandle, setKeepHandle] = useState<Side>("primary");
  const [keepDesign, setKeepDesign] = useState<Side>("primary");

  const codeInput = () => {
    const trimmed = pin.trim();
    return trimmed.startsWith("rout-merge:") ? { token: trimmed } : { pin: trimmed };
  };

  const generate = async () => {
    setBusy(true);
    try {
      const r = await withStepUp(() => startAccountMerge());
      setTicket({ pin: r.pin, qrPayload: r.qrPayload });
    } catch {
      toast.error(t("merge_account.error"));
    } finally {
      setBusy(false);
    }
  };

  const loadPreview = async () => {
    setBusy(true);
    try {
      const r = await previewAccountMerge({ data: codeInput() });
      if (!r.ok) return toast.error(ERRORS[r.reason ?? ""] ?? "Deze code is ongeldig of verlopen. Maak een nieuwe op je hoofdaccount.");
      setPreview({ primary: r.primary, secondary: r.secondary, codeSentTo: r.codeSentTo });
      // Default: keep the verified handle.
      setKeepHandle(!r.primary.verified && r.secondary.verified ? "secondary" : "primary");
    } catch {
      toast.error(t("merge_account.error"));
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    if (!window.confirm("Samenvoegen kan niet ongedaan gemaakt worden. Doorgaan?")) return;
    setBusy(true);
    try {
      const r = await withStepUp(() => redeemAccountMerge({ data: { ...codeInput(), code, keepHandle, keepDesign } }));
      if (!r.ok) return toast.error(ERRORS[r.reason ?? ""] ?? "Deze code is ongeldig of verlopen. Begin opnieuw.");
      toast.success(t("merge_account.success"));
      window.location.href = "/auth/sign-in";
    } catch {
      toast.error(t("merge_account.error"));
    } finally {
      setBusy(false);
    }
  };

  const bothVerified = preview?.primary.verified && preview?.secondary.verified;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <GitMerge className="h-4 w-4" /> {t("merge_account.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Alles komt samen op één account: gekoppelde logins, links, badges, QR-codes en gegevens — zonder dubbels.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {(["primary", "secondary"] as Role[]).map((option) => (
          <button key={option} type="button" aria-pressed={role === option} onClick={() => setRole(option)}
            className={cn("rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
              role === option ? "border-foreground bg-muted/60 text-foreground" : "border-border text-muted-foreground hover:bg-muted/40")}>
            {option === "primary" ? "Dit account behouden" : "Dit account samenvoegen met een ander"}
          </button>
        ))}
      </div>

      {role === "primary" ? (
        <div className="space-y-3 rounded-xl border border-border bg-background p-3">
          {ticket ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-full rounded-2xl border-2 border-primary/50 bg-primary/5 p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Je samenvoeg-code</p>
                <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.4em]">{ticket.pin}</p>
                <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={async () => {
                  await navigator.clipboard.writeText(ticket.pin);
                  toast.success(trI18n.t("ui.72278bbfff"));
                }}>
                  <Copy className="h-4 w-4" /> Kopiëren
                </Button>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Log in op je tweede account, kies "Dit account samenvoegen met een ander" en vul deze code in. Geldig 5 minuten.
              </p>
              <QRCodeSVG value={ticket.qrPayload} size={140} />
              <Button variant="ghost" size="sm" onClick={() => setTicket(null)}>Nieuwe code</Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Maak een code op het account dat je wilt houden. Op het andere account kies je daarna welke handle en welk ontwerp blijven.
              </p>
              <Button onClick={generate} disabled={busy} className="h-11 gap-1.5">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Code maken
              </Button>
            </>
          )}
        </div>
      ) : !preview ? (
        <div className="space-y-3 rounded-xl border border-border bg-background p-3">
          <p className="text-sm font-medium">Vul de code van je hoofdaccount in</p>
          <Input value={pin} inputMode="numeric" maxLength={64} placeholder="123456" onChange={(e) => setPin(e.target.value)}
            className="h-11 rounded-xl tracking-widest" />
          <Button onClick={loadPreview} disabled={busy || !pin.trim()} className="h-11 gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Verder
          </Button>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-border bg-background p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <AccountCard s={preview.primary} label="Blijft bestaan" />
            <AccountCard s={preview.secondary} label="Wordt samengevoegd (dit account)" />
          </div>

          <Choice title={bothVerified ? "Beide zijn geverifieerd: welke handle wordt je geverifieerde handle?" : "Welke handle wil je houden?"}
            value={keepHandle} onChange={setKeepHandle}
            options={[
              { side: "primary", label: preview.primary.handle ? `@${preview.primary.handle}` : "Geen handle", hint: preview.primary.verified ? "Geverifieerd" : undefined },
              ...(preview.secondary.handle ? [{ side: "secondary" as Side, label: `@${preview.secondary.handle}`, hint: preview.secondary.verified ? "Geverifieerd" : undefined }] : []),
            ]} />

          <Choice title="Welk kaartontwerp gebruik je?" value={keepDesign} onChange={setKeepDesign}
            options={[
              { side: "primary", label: `Ontwerp van ${preview.primary.handle ? `@${preview.primary.handle}` : "hoofdaccount"}` },
              { side: "secondary", label: `Ontwerp van ${preview.secondary.handle ? `@${preview.secondary.handle}` : "dit account"}` },
            ]} />
          <p className="text-xs text-muted-foreground">Het andere ontwerp bewaren we bij "Mijn ontwerpen", zodat je later kunt terugwisselen.</p>

          <div className="space-y-2">
            <p className="text-sm font-medium">Bevestig met de code die we naar {preview.codeSentTo} stuurden</p>
            <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} maxLength={6} inputMode="numeric"
              autoComplete="one-time-code" placeholder="123456" className="h-11 w-40 rounded-xl text-center font-mono tracking-[0.3em]" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={execute} disabled={busy || code.length !== 6} className="h-11 gap-1.5">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Accounts samenvoegen
            </Button>
            <Button variant="ghost" onClick={() => { setPreview(null); setCode(""); }} className="h-11">Terug</Button>
          </div>
        </div>
      )}
    </section>
  );
}
