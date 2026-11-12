import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { BUNNY_URL, SITE_ORIGIN } from "@/lib/site";
import { i18n as trI18n } from "@/lib/i18n";

/**
 * Twee kant-en-klare, ultraschone HTML-mailtemplates in ROUT-huisstijl:
 *
 *   personal — Jona Zeno Delplanche (jona@rout.be)
 *   team     — het ROUT-team (hallo@rout.be)
 *
 * Alles is tabelgebaseerd met inline CSS, zodat het in Infomaniak Mail,
 * Outlook, Apple Mail en Gmail identiek rendert. Geen externe stylesheets,
 * geen webfonts, geen trackingpixels.
 */

type Variant = "personal" | "team";

interface MailData {
  variant: Variant;
  sender: string;
  role: string;
  email: string;
  phone: string;
  handle: string;
  subject: string;
  greeting: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const SOCIALS: Array<{ label: string; url: string }> = [
  { label: "rout.be", url: SITE_ORIGIN },
  { label: "Mastodon", url: "https://mastodon.social/@rout" },
  { label: "Bluesky", url: "https://bsky.app/profile/rout.be" },
  { label: "GitHub", url: "https://github.com/jdelplanche" },
  { label: "LinkedIn", url: "https://www.linkedin.com/company/rout" },
];

const PRESETS: Record<Variant, Partial<MailData>> = {
  personal: {
    sender: "Jona Zeno Delplanche",
    role: "Oprichter — ROUT",
    email: "jona@rout.be",
    phone: "",
    handle: "rout.be/jona",
    greeting: "Beste",
    body: "Bedankt voor je bericht. Hierbij de volgende stap — laat zeker weten als er iets onduidelijk is, dan bel ik je gerust even.",
  },
  team: {
    sender: "Team ROUT",
    role: "Support & onboarding",
    email: "hallo@rout.be",
    phone: "",
    handle: "rout.be",
    greeting: "Hallo",
    body: "Bedankt om ROUT te gebruiken. We hebben je vraag bekeken en helpen je hier verder. Antwoord gewoon op deze mail als er nog iets ontbreekt.",
  },
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:15px;line-height:25px;color:#333333;letter-spacing:-0.1px;">${esc(
          p,
        ).replace(/\n/g, "<br />")}</p>`,
    )
    .join("\n              ");
}

function buildHtml(d: MailData): string {
  const socials = SOCIALS.map(
    (s) =>
      `<a href="${s.url}" style="font-family:${FONT};font-size:11px;line-height:18px;color:#777777;text-decoration:none;">${s.label}</a>`,
  ).join(`<span style="font-family:${FONT};font-size:11px;color:#cccccc;padding:0 7px;">·</span>`);

  const cta =
    d.ctaLabel && d.ctaUrl
      ? `
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:6px 0 22px 0;">
                <tr>
                  <td style="border-radius:12px;background:#111111;">
                    <a href="${esc(d.ctaUrl)}" style="display:inline-block;padding:13px 22px;font-family:${FONT};font-size:14px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;letter-spacing:-0.2px;">${esc(
                      d.ctaLabel,
                    )}</a>
                  </td>
                </tr>
              </table>`
      : "";

  return `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${esc(d.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f6f4;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#f6f6f4;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;max-width:560px;background:#ffffff;border:1px solid #e6e6e1;border-radius:20px;">
            <tr>
              <td style="padding:28px 30px 0 30px;">
                <img src="${BUNNY_URL}" width="34" height="34" alt="ROUT" style="display:block;border:0;outline:none;text-decoration:none;" />
                <div style="padding-top:14px;font:600 17px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.14em;color:#111111;">ROUT</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 30px 0 30px;font-family:${FONT};font-size:21px;font-weight:600;line-height:29px;letter-spacing:-0.4px;color:#111111;">${esc(
                d.subject,
              )}</td>
            </tr>
            <tr>
              <td style="padding:16px 30px 0 30px;">
              <p style="margin:0 0 16px 0;font-family:${FONT};font-size:15px;line-height:25px;color:#333333;">${esc(
                d.greeting,
              )},</p>
              ${paragraphs(d.body)}${cta}
              </td>
            </tr>
            <tr>
              <td style="padding:6px 30px 0 30px;">
                <div style="border-top:1px solid #eeeeea;"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 30px 0 30px;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <tr>
                    <td valign="top" style="border-left:2px solid #111111;padding-left:15px;">
                      <div style="font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;letter-spacing:-0.3px;color:#111111;">${esc(
                        d.sender,
                      )}</div>
                      ${
                        d.role
                          ? `<div style="font-family:${FONT};font-size:12px;line-height:18px;color:#666666;padding-top:2px;">${esc(
                              d.role,
                            )}</div>`
                          : ""
                      }
                      <div style="padding-top:6px;">
                        <a href="mailto:${esc(
                          d.email,
                        )}" style="font-family:${FONT};font-size:12px;line-height:18px;color:#444444;text-decoration:none;">${esc(
                          d.email,
                        )}</a>
                      </div>
                      ${
                        d.phone
                          ? `<div><a href="tel:${esc(
                              d.phone.replace(/\s/g, ""),
                            )}" style="font-family:${FONT};font-size:12px;line-height:18px;color:#444444;text-decoration:none;">${esc(
                              d.phone,
                            )}</a></div>`
                          : ""
                      }
                      <div style="padding-top:8px;">
                        <a href="https://${esc(
                          d.handle,
                        )}" style="font-family:${FONT};font-size:11px;line-height:16px;color:#111111;text-decoration:none;letter-spacing:0.2px;">${esc(
                          d.handle,
                        )} &#8599;</a>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 30px 28px 30px;">
                <div style="padding-bottom:8px;">${socials}</div>
                <div style="font-family:${FONT};font-size:11px;line-height:18px;color:#aaaaaa;">
                  ROUT · Belgi&euml; · privacy-first: geen tracking, geen trackingpixels in deze mail.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export default function EmailTemplatesPage() {
  const [data, setData] = useState<MailData>({
    variant: "personal",
    subject: "Je ROUT-link staat klaar",
    ctaLabel: "Open je dashboard",
    ctaUrl: `${SITE_ORIGIN}/dashboard`,
    phone: "",
    ...PRESETS.personal,
  } as MailData);
  const [copied, setCopied] = useState(false);

  const html = useMemo(() => buildHtml(data), [data]);
  const set = (k: keyof MailData) => (v: string) => setData((p) => ({ ...p, [k]: v }));

  const pick = (variant: Variant) =>
    setData((p) => ({ ...p, variant, ...PRESETS[variant] }) as MailData);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      toast.success(trI18n.t("ui.76ac1c84ac"));
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(trI18n.t("ui.87b2ea9c1e"));
    }
  };

  const fields: Array<{ k: keyof MailData; label: string; placeholder?: string }> = [
    { k: "subject", label: "Titel in de mail" },
    { k: "greeting", label: "Aanspreking", placeholder: "Beste" },
    { k: "sender", label: "Afzender" },
    { k: "role", label: "Functie" },
    { k: "email", label: "E-mail" },
    { k: "phone", label: "Telefoon (optioneel)" },
    { k: "handle", label: "Link-in-bio badge", placeholder: "rout.be/jona" },
    { k: "ctaLabel", label: "Knoptekst (leeg = geen knop)" },
    { k: "ctaUrl", label: "Knop-URL" },
  ];

  return (
    <AppLayout
      title="E-mailtemplates"
      description="Twee schone HTML-mails in ROUT-huisstijl: persoonlijk (jona@rout.be) en team (hallo@rout.be). Tabelgebaseerd, inline CSS, geen tracking."
      crumbs={[{ label: "E-mailtemplates" }]}
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="flex gap-2">
            {(["personal", "team"] as Variant[]).map((v) => (
              <Button
                key={v}
                type="button"
                variant={data.variant === v ? "default" : "outline"}
                className="flex-1"
                onClick={() => pick(v)}
              >
                {v === "personal" ? "Jona" : "Team"}
              </Button>
            ))}
          </div>

          {fields.map((f) => (
            <div key={f.k} className="space-y-1.5">
              <Label htmlFor={f.k}>{f.label}</Label>
              <Input
                id={f.k}
                value={String(data[f.k] ?? "")}
                placeholder={f.placeholder}
                onChange={(e) => set(f.k)(e.target.value)}
              />
            </div>
          ))}

          <div className="space-y-1.5">
            <Label htmlFor="body">Berichttekst</Label>
            <textarea
              id="body"
              value={data.body}
              onChange={(e) => set("body")(e.target.value)}
              className="h-40 w-full rounded-xl border border-border bg-background p-3 text-sm"
            />
            <p className="text-xs text-muted-foreground">Lege regel = nieuwe alinea.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-white p-2">
            <iframe
              title="Mail preview"
              srcDoc={html}
              className="h-[640px] w-full rounded-xl border-0"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Kopieer Raw HTML
            </Button>
            <span className="text-xs text-muted-foreground">
              Infomaniak Mail → nieuw bericht → HTML-bron plakken.
            </span>
          </div>

          <textarea
            readOnly
            value={html}
            spellCheck={false}
            aria-label="Raw HTML"
            className="h-72 w-full rounded-xl border border-border bg-neutral-900 p-4 font-mono text-xs text-neutral-100"
          />
        </div>
      </div>
    </AppLayout>
  );
}
