import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  confirmPhoneVerification,
  getPhoneStatus,
  removePhoneNumber,
  requestPhoneVerification,
} from "@/lib/phone/phone.functions";
import { i18n as trI18n } from "@/lib/i18n";

const KEY = ["phone-status"];
const COUNTRIES = ["+32", "+31", "+33", "+49", "+352", "+44"];

const MESSAGES: Record<string, string> = {
  invalid_number: "Dit nummer lijkt niet te kloppen.",
  not_configured: "Sms-verificatie is nog niet actief. We zetten dit binnenkort aan.",
  rate_limited: "Te veel pogingen. Probeer het later opnieuw.",
  send_failed: "De sms kon niet verstuurd worden. Probeer later opnieuw.",
  invalid: "Deze code klopt niet.",
  expired: "Deze code is verlopen. Vraag een nieuwe aan.",
  too_many_attempts: "Te veel foute pogingen. Vraag een nieuwe code aan.",
  no_code: "Vraag eerst een code aan.",
};

export function PhoneVerification() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: KEY, queryFn: useServerFn(getPhoneStatus) });
  const request = useServerFn(requestPhoneVerification);
  const confirm = useServerFn(confirmPhoneVerification);
  const remove = useServerFn(removePhoneNumber);
  const [cc, setCc] = useState("+32");
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState<{ code: string; line: string } | null>(null);

  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const left = expiresAt ? Math.max(0, Math.round((expiresAt - now) / 1000)) : 0;
  const s = status.data;

  const send = async () => {
    setBusy(true);
    try {
      const r = await request({ data: { countryCode: cc, number } });
      if (r.status === "sent") {
        setExpiresAt(new Date(r.expiresAt).getTime());
        setNow(Date.now());
        setCode("");
        toast.success(`Code verstuurd naar ${r.masked}`);
      } else if (r.status === "manual") {
        setManual({ code: r.code, line: r.line });
      } else toast.error(MESSAGES[r.status] ?? "Er ging iets mis.");
    } catch {
      toast.error(trI18n.t("ui.cbdcf1f424"));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      const r = await confirm({ data: { code } });
      if (r.status === "verified") {
        setExpiresAt(null);
        toast.success(trI18n.t("ui.2f25f42e16"));
        await qc.invalidateQueries({ queryKey: KEY });
      } else toast.error(MESSAGES[r.status] ?? "Er ging iets mis.");
    } catch {
      toast.error(trI18n.t("ui.cbdcf1f424"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <Smartphone className="h-4 w-4" /> Telefoonnummer
      </h2>

      {s?.verified && !expiresAt ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Geverifieerd <span className="font-mono">{s.masked}</span>
          </p>
          <Button variant="ghost" size="sm" onClick={async () => { await remove(); await qc.invalidateQueries({ queryKey: KEY }); }}>
            Verwijderen
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            We bewaren je nummer versleuteld en tonen enkel de laatste 4 cijfers.
          </p>
          {s && !s.configured && (
            <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">{MESSAGES.not_configured}</p>
          )}
          <div className="flex gap-2">
            <select aria-label="Landcode" value={cc} onChange={(e) => setCc(e.target.value)}
              className="h-11 rounded-xl border border-input bg-background px-3 text-sm">
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <Input inputMode="tel" autoComplete="tel-national" placeholder="470 12 34 56" value={number}
              maxLength={20} onChange={(e) => setNumber(e.target.value)} className="h-11 rounded-xl" />
            <Button onClick={send} disabled={busy || number.replace(/\D/g, "").length < 6 || (left > 540)} className="h-11 shrink-0">
              {expiresAt ? "Opnieuw" : "Code sturen"}
            </Button>
          </div>
          {manual && (
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
              Voor buitenlandse nummers is automatische sms uitgeschakeld. Stuur een sms met code{" "}
              <strong className="font-mono">{manual.code}</strong> vanaf jouw nummer naar onze verificatielijn{" "}
              <strong>{manual.line}</strong> of via de officiële ROUT Telegram-bot. Geldig 10 minuten.
            </div>
          )}
          <p className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border px-2 py-0.5 opacity-60">WhatsApp · Coming soon</span>
            <span className="rounded-full border border-border px-2 py-0.5 opacity-60">Wereldwijde sms · Coming soon</span>
          </p>
          {expiresAt && (
            <div className="flex flex-wrap items-center gap-2">
              <Input inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={6}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="h-11 w-36 rounded-xl text-center font-mono tracking-[0.4em]" aria-label="Code van 6 cijfers" />
              <Button onClick={verify} disabled={busy || code.length !== 6 || left === 0} className="h-11">Bevestigen</Button>
              <span className="font-mono text-xs text-muted-foreground">
                {left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "verlopen"}
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
