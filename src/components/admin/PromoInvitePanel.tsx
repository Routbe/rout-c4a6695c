import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ClipboardCopy, Loader2, MessageSquare, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notifyError, notifySuccess } from "@/lib/notify";
import { QRCodeSVG } from "qrcode.react";
import { createPromoCode, listPromos } from "@/lib/promo-admin.functions";

type PromoRow = Awaited<ReturnType<typeof listPromos>>[number];
type DiscountKind = "percent" | "amount" | "percent_capped";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Client-side preview code; the server regenerates when the field is empty. */
function suggestCode(): string {
  let body = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const byte of bytes) body += ALPHABET[byte % ALPHABET.length];
  return `ROUT-${body}`;
}

function toCents(value: string): number {
  return Math.round((Number(value.replace(",", ".")) || 0) * 100);
}

/**
 * Promo code generator + multilingual invitation mailer for the admin portal.
 * Sending is optional: the admin can e-mail, SMS or simply copy the code.
 */
export function PromoInvitePanel() {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<DiscountKind>("percent");
  const [percentOff, setPercentOff] = useState("100");
  const [amountOff, setAmountOff] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState<"nl" | "en" | "fr" | "de">("nl");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<PromoRow[]>([]);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [smsQr, setSmsQr] = useState<{ url: string; code: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows(await listPromos());
    } catch {
      /* the list is a convenience; a failure must not block creation */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Maakt (of werkt) de code bij. `withEmail`/`withPhone` bepalen of de server
   * de code ook meteen per e-mail of SMS verstuurt.
   */
  const save = async (
    withEmail: boolean,
    withPhone = false,
  ): Promise<{ code: string; texted: boolean } | null> => {
    setBusy(true);
    setConfirmation(null);
    try {
      const usesPercent = kind !== "amount";
      const result = await createPromoCode({
        data: {
          ...(code.trim() ? { code: code.trim() } : {}),
          ...(label.trim() ? { label: label.trim() } : {}),
          percentOff: usesPercent ? Number(percentOff) || 0 : 0,
          amountOffCents: kind === "amount" ? toCents(amountOff) : 0,
          ...(kind === "percent_capped" && maxDiscount
            ? { maxDiscountCents: toCents(maxDiscount) }
            : {}),
          ...(maxRedemptions ? { maxRedemptions: Number(maxRedemptions) } : {}),
          ...(expiresAt ? { expiresAt } : {}),
          ...(withEmail && email.trim() ? { email: email.trim() } : {}),
          ...(withPhone && phone.trim() ? { phone: phone.trim() } : {}),
          language,
        },
      });
      if (!result.ok) {
        notifyError(result.error ?? t("admin.promo.err"));
        return null;
      }
      const message = result.emailed
        ? t("admin.promo.saved", { email: email.trim() })
        : t("admin.promo.saved_nomail", { code: result.code });
      setConfirmation(message);
      setLastCode(result.code);
      // De code bestaat, maar bezorging kan alsnog geweigerd zijn (ontbrekende
      // of ongeldige BREVO_API_KEY, ongeldig nummer). Dat mag nooit stil blijven.
      if (result.error) {
        setConfirmation(`${message} — ${result.error}`);
        notifyError(result.error);
      } else {
        notifySuccess(message);
      }
      setCode("");
      void refresh();
      return { code: result.code, texted: result.texted === true };
    } catch (error) {
      notifyError(error instanceof Error ? error.message : t("admin.promo.err"));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    const value = lastCode ?? (await save(false))?.code;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      notifySuccess(t("admin.promo.copied"));
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      notifyError(t("admin.promo.copy_failed"));
    }
  };

  const sendSms = async () => {
    if (!phone.trim()) {
      notifyError(t("admin.promo.phone_required"));
      return;
    }
    const saved = await save(false, true);
    if (!saved) return;
    const value = saved.code;
    // Verstuurd via de provider? Dan is de berichten-app niet meer nodig.
    if (saved.texted) {
      notifySuccess(t("admin.promo.sms_sent", { phone: phone.trim() }));
      return;
    }
    const body = t("admin.promo.sms_body", { code: value });
    const number = phone.replace(/[^\d+]/g, "");
    // iOS wil `&body=`, Android `?body=` — beide accepteren `?&body=`.
    const url = `sms:${number}?&body=${encodeURIComponent(body)}`;
    const isHandheld =
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (isHandheld) {
      // Opent de berichten-app met nummer én tekst al ingevuld.
      window.location.href = url;
      return;
    }
    // Op desktop is er geen berichten-app: toon een QR om met de telefoon te scannen.
    setSmsQr({ url, code: value });
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <Sparkles className="h-4 w-4" aria-hidden /> {t("admin.promo.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("admin.promo.subtitle")}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="promo-code" className="text-xs">
            {t("admin.promo.code")}
          </Label>
          <div className="flex gap-2">
            <Input
              id="promo-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ROUT-7KQ4PX"
              className="h-9 font-mono"
            />
            <Button
              type="button"
              variant="secondary"
              className="h-9 whitespace-nowrap"
              onClick={() => setCode(suggestCode())}
            >
              {t("admin.promo.generate")}
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="promo-label" className="text-xs">
            {t("admin.promo.label")}
          </Label>
          <Input
            id="promo-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="h-9"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="promo-kind" className="text-xs">
            {t("admin.promo.kind")}
          </Label>
          <select
            id="promo-kind"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as DiscountKind)}
          >
            <option value="percent">{t("admin.promo.kind.percent")}</option>
            <option value="amount">{t("admin.promo.kind.amount")}</option>
            <option value="percent_capped">{t("admin.promo.kind.capped")}</option>
          </select>
        </div>

        {kind !== "amount" ? (
          <div className="space-y-1">
            <Label htmlFor="promo-percent" className="text-xs">
              {t("admin.promo.percent")}
            </Label>
            <Input
              id="promo-percent"
              inputMode="numeric"
              value={percentOff}
              onChange={(e) => setPercentOff(e.target.value.replace(/[^0-9]/g, ""))}
              className="h-9"
            />
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="promo-amount" className="text-xs">
              {t("admin.promo.amount")}
            </Label>
            <Input
              id="promo-amount"
              inputMode="decimal"
              value={amountOff}
              onChange={(e) => setAmountOff(e.target.value)}
              placeholder="5,00"
              className="h-9"
            />
          </div>
        )}

        {kind === "percent_capped" && (
          <div className="space-y-1">
            <Label htmlFor="promo-max-discount" className="text-xs">
              {t("admin.promo.max_discount")}
            </Label>
            <Input
              id="promo-max-discount"
              inputMode="decimal"
              value={maxDiscount}
              onChange={(e) => setMaxDiscount(e.target.value)}
              placeholder="10,00"
              className="h-9"
            />
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="promo-expires" className="text-xs">
            {t("admin.promo.expires")}
          </Label>
          <Input
            id="promo-expires"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="h-9"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="promo-max" className="text-xs">
            {t("admin.promo.max")}
          </Label>
          <Input
            id="promo-max"
            inputMode="numeric"
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(e.target.value.replace(/[^0-9]/g, ""))}
            className="h-9"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="promo-email" className="text-xs">
            {t("admin.promo.email")}
          </Label>
          <Input
            id="promo-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="klant@voorbeeld.be"
            className="h-9"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="promo-phone" className="text-xs">
            {t("admin.promo.phone")}
          </Label>
          <Input
            id="promo-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+32470123456"
            className="h-9"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="promo-language" className="text-xs">
            {t("admin.promo.language")}
          </Label>
          <select
            id="promo-language"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={language}
            onChange={(e) => setLanguage(e.target.value as typeof language)}
          >
            <option value="nl">Nederlands</option>
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t("admin.promo.optional_hint")}</p>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void save(true)} disabled={busy} data-testid="promo-submit">
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="mr-2 h-4 w-4" aria-hidden />
          )}
          {email.trim() ? t("admin.promo.submit") : t("admin.promo.submit_save")}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void copyCode()}>
          {copied ? (
            <Check className="mr-2 h-4 w-4" aria-hidden />
          ) : (
            <ClipboardCopy className="mr-2 h-4 w-4" aria-hidden />
          )}
          {copied ? t("admin.promo.copied") : t("admin.promo.copy")}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void sendSms()}>
          <MessageSquare className="mr-2 h-4 w-4" aria-hidden />
          {t("admin.promo.sms")}
        </Button>
        {smsQr ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
            <QRCodeSVG value={smsQr.url} size={104} includeMargin />
            <div className="space-y-1 text-xs">
              <p className="font-medium">Scan met je telefoon</p>
              <p className="text-muted-foreground">
                Je berichten-app opent met {phone.trim()} en code{" "}
                <span className="font-mono">{smsQr.code}</span>.
              </p>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSmsQr(null)}>
                Sluiten
              </Button>
            </div>
          </div>
        ) : null}
        {confirmation ? (
          <p
            data-testid="promo-confirmation"
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
          >
            {confirmation}
          </p>
        ) : null}
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-border/70">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/60 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t("admin.promo.code")}</th>
                <th className="px-3 py-2">{t("admin.promo.label")}</th>
                <th className="px-3 py-2">%</th>
                <th className="px-3 py-2">€</th>
                <th className="px-3 py-2">{t("admin.promo.expires")}</th>
                <th className="px-3 py-2">#</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code} className="border-t border-border/60">
                  <td className="px-3 py-2 font-mono">{row.code}</td>
                  <td className="px-3 py-2">{row.label ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{row.percentOff}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {(row.amountOffCents / 100).toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    {row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.redeemedCount}
                    {row.maxRedemptions ? ` / ${row.maxRedemptions}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
