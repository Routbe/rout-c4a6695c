import { useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { i18n as trI18n } from "@/lib/i18n";

interface SigData {
  name: string;
  role: string;
  email: string;
  phone: string;
  website: string;
  avatar: string;
  handle: string;
  useQr: boolean;
}

/** 60x60 micro QR as a PNG-free, mail-safe data URL (SVG base64). */
function microQrDataUrl(value: string): string {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < count; r += 1) {
    let run = 0;
    for (let c = 0; c <= count; c += 1) {
      const dark = c < count && qr.isDark(r, c);
      if (dark) run += 1;
      else if (run) {
        d += `M${c - run} ${r}h${run}v1h-${run}z`;
        run = 0;
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${count} ${count}" width="60" height="60"><rect width="${count}" height="${count}" fill="#ffffff"/><path d="${d}" fill="#111111"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function buildHtml(d: SigData): string {
  const site = d.website.replace(/^https?:\/\//, "");
  const mark = d.useQr
    ? microQrDataUrl(d.website || `https://${d.handle}`)
    : d.avatar || "https://rout.be/img/logo.png";
  const line = (label: string, value: string, href?: string) =>
    value
      ? `<tr><td style="font-family:${FONT};font-size:12px;line-height:18px;color:#444444;letter-spacing:-0.1px;padding:0;">${
          href
            ? `<a href="${href}" style="color:#444444;text-decoration:none;">${value}</a>`
            : value
        }</td></tr>`
      : "";

  return `<table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:transparent;">
  <tr>
    <td valign="top" style="padding:0 15px 0 0;">
      <img src="${mark}" width="60" height="60" alt="${d.name}" style="display:block;width:60px;height:60px;border-radius:${d.useQr ? "8px" : "30px"};border:0;outline:none;text-decoration:none;" />
    </td>
    <td valign="top" style="border-left:2px solid #111111;padding-left:15px;">
      <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr><td style="font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;color:#111111;letter-spacing:-0.3px;padding:0 0 1px 0;">${d.name}</td></tr>
        ${d.role ? `<tr><td style="font-family:${FONT};font-size:12px;line-height:18px;color:#666666;letter-spacing:-0.1px;padding:0 0 6px 0;">${d.role}</td></tr>` : ""}
        ${line("email", d.email, `mailto:${d.email}`)}
        ${line("phone", d.phone, `tel:${d.phone.replace(/\s/g, "")}`)}
        ${line("web", site, d.website)}
        <tr><td style="padding:8px 0 0 0;">
          <a href="https://${d.handle}" style="font-family:${FONT};font-size:11px;line-height:16px;color:#111111;text-decoration:none;letter-spacing:0.2px;">${d.handle} &#8599;</a>
        </td></tr>
      </table>
    </td>
  </tr>
</table>`;
}

export default function SignaturePage() {
  const [data, setData] = useState<SigData>({
    name: "Jona Delplanche",
    role: "Founder — ROUT",
    email: "jona@rout.be",
    phone: "+32 470 00 00 00",
    website: "https://rout.be",
    avatar: "",
    handle: "rout.be/jona",
    useQr: false,
  });
  const [copied, setCopied] = useState(false);

  const html = useMemo(() => buildHtml(data), [data]);
  const set = (k: keyof SigData) => (v: string | boolean) => setData((p) => ({ ...p, [k]: v }));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      toast.success(trI18n.t("ui.e9bf2a43e9"));
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(trI18n.t("ui.87b2ea9c1e"));
    }
  };

  const fields: Array<{ k: keyof SigData; label: string; placeholder?: string }> = [
    { k: "name", label: "Naam" },
    { k: "role", label: "Functie" },
    { k: "email", label: "E-mail" },
    { k: "phone", label: "Telefoon" },
    { k: "website", label: "Website", placeholder: "https://rout.be" },
    { k: "avatar", label: "Avatar-URL (publiek)", placeholder: "https://…/avatar.png" },
    { k: "handle", label: "Link-in-bio badge", placeholder: "rout.be/jona" },
  ];

  return (
    <AppLayout
      title="E-mailhandtekening"
      description="Genereer een tabelgebaseerde HTML-handtekening voor Infomaniak. Inline CSS, geen externe stylesheets."
      crumbs={[{ label: "Handtekening" }]}
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="space-y-4">
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
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <div>
              <p className="text-sm font-medium">Micro QR i.p.v. avatar</p>
              <p className="text-xs text-muted-foreground">60×60 QR naar je website</p>
            </div>
            <Switch checked={data.useQr} onCheckedChange={(v) => set("useQr")(v)} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-white p-6">
            <p className="mb-3 text-xs uppercase tracking-widest text-neutral-500">Live view</p>
            <iframe
              title="Handtekening preview"
              srcDoc={`<!doctype html><html><body style="margin:0;padding:4px;background:#ffffff;">${html}</body></html>`}
              className="h-[160px] w-full border-0"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Kopieer Raw HTML
            </Button>
            <span className="text-xs text-muted-foreground">
              Plakken in Infomaniak: Mail → Instellingen → Handtekening → HTML-modus.
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
