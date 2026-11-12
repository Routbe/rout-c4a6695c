import { useEffect, useRef } from "react";
import { Check, Fingerprint, Wallet, ShieldCheck, ArrowUpRight, Braces, Radio, Music2, Video, Github, Globe } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useI18n } from "@/lib/i18n";

function TerminalFrame({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return <div className="infra-terminal"><div className="infra-terminal-bar"><span className="infra-terminal-lights" aria-hidden><i /><i /><i /></span><span>{title}</span><span className="ml-auto">{t("infra.example")}</span></div>{children}</div>;
}

export function IdentityVisual() {
  return <TerminalFrame title="identity / OpenID Connect"><div className="space-y-3 p-5 font-mono text-xs">
    <p className="text-muted-foreground">$ rout identity --scope openid</p>
    <p className="flex gap-2"><Check className="h-3.5 w-3.5 text-primary" /> PKCE · pairwise subject</p>
    <p className="flex gap-2"><Check className="h-3.5 w-3.5 text-primary" /> passkey · consent</p>
    <div className="mt-5 flex items-center gap-3 border-t border-border pt-4"><Fingerprint className="h-8 w-8 text-primary" /><span>ROUT ID<br /><span className="text-muted-foreground">identity ≠ humanity</span></span><ShieldCheck className="ml-auto h-5 w-5 text-primary" /></div>
  </div></TerminalFrame>;
}

/** Uses ROUT's actual public face renderer; no invented hologram or authentication token. */
export function WalletVisual() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    void import("@/components/wallet/card-faces").then(async ({ drawCardFaces }) => {
      const surface = canvasRef.current?.closest(".infra-home");
      if (!surface || cancelled) return;
      const style = getComputedStyle(surface);
      const faces = await drawCardFaces({ serial: "public-preview", handle: "rout", space: "root", displayName: "ROUT", subheader: "Sovereign Digital Identity", url: "https://rout.be", qrValue: "https://rout.be", sovereignId: "ROUT · PREVIEW", hexBackgroundColor: style.getPropertyValue("--infra-card-base").trim(), hexForegroundColor: style.getPropertyValue("--infra-card-ink").trim() });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = faces.front.width; canvas.height = faces.front.height;
      canvas.getContext("2d")?.drawImage(faces.front, 0, 0);
    }).catch(() => { /* Printed fallback remains visible. */ });
    return () => { cancelled = true; };
  }, []);
  const { t } = useI18n();
  return <div className="infra-wallet-visual"><div className="infra-wallet-sheet"><Wallet className="h-5 w-5 text-primary" /><span className="font-mono text-xs">Google Wallet<br />Apple Wallet</span><span className="font-mono text-[10px] text-muted-foreground">{t("infra.example")}</span></div><canvas ref={canvasRef} className="infra-card-face" role="img" aria-label={t("infra.cardPreview")} /><span className="infra-wallet-caption"><Radio className="h-3 w-3" /> NFC / public identity</span></div>;
}

export function CommerceVisual() {
  const { t } = useI18n();
  return <TerminalFrame title="commerce / direct support"><div className="space-y-4 p-5 font-mono text-xs"><p className="text-muted-foreground">$ rout support --to creator</p><div className="flex items-baseline justify-between border-b border-border pb-3"><span>{t("infra.support")}</span><span className="text-3xl text-foreground">€5.00</span></div><p className="flex justify-between"><span className="text-muted-foreground">EPC / SEPA</span><ArrowUpRight className="h-4 w-4 text-primary" /></p><p className="text-primary">ROUT → creator</p><p className="text-muted-foreground">{t("infra.direct")}</p></div></TerminalFrame>;
}

export function RoutingVisual() {
  const { t } = useI18n();
  return <TerminalFrame title="routing / scan events"><div className="flex items-center gap-5 p-5"><div className="infra-qr"><QRCodeSVG value="https://rout.be/qr" size={104} bgColor="transparent" fgColor="currentColor" /></div><div className="min-w-0 flex-1 font-mono text-xs"><p>rout.be/…</p><p className="mt-2 text-muted-foreground">UTM · destination</p><svg viewBox="0 0 170 64" className="mt-4 w-full" aria-label={t("infra.sampleChart")} role="img"><path d="M0 52H170M0 30H170M0 8H170" className="stroke-border" fill="none" /><path d="M0 48L12 48L18 22L24 48L39 43L47 32L55 45L67 45L76 6L83 45L101 39L112 24L120 46L139 38L148 15L156 38L170 29" className="stroke-primary" strokeWidth="2" fill="none" /></svg></div></div><p className="border-t border-border px-5 py-3 font-mono text-[10px] text-muted-foreground">{t("infra.localQr")}</p></TerminalFrame>;
}

const INTEGRATIONS = [
  { name: "Google Wallet", Icon: Wallet }, { name: "Apple Wallet", Icon: Wallet }, { name: "Stripe", Icon: ArrowUpRight },
  { name: "Mollie", Icon: ArrowUpRight }, { name: "OpenID Connect", Icon: Fingerprint }, { name: "NFC", Icon: Radio },
  { name: "Spotify", Icon: Music2 }, { name: "YouTube", Icon: Video }, { name: "GitHub", Icon: Github }, { name: "Mastodon", Icon: Globe }, { name: "MCP / API", Icon: Braces },
];
export function IntegrationMesh() {
  const { t } = useI18n();
  return <section className="infra-integrations" aria-label={t("infra.integrations")}><p className="mb-6 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">{t("infra.integrations")}</p><div className="infra-marquee"><div className="infra-marquee-track">{[0, 1].map((copy) => <div className="infra-marquee-group" key={copy} aria-hidden={copy === 1 ? true : undefined}>{INTEGRATIONS.map(({ name, Icon }) => <span key={name} className="flex items-center gap-2 whitespace-nowrap font-mono text-xs text-muted-foreground"><Icon className="h-4 w-4" aria-hidden />{name}</span>)}</div>)}</div></div><p className="mt-5 text-center font-mono text-[11px] text-muted-foreground">{t("infra.integrationNote")}</p></section>;
}

export function DataPaths() {
  return <svg className="infra-data-paths" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden><g fill="none"><path className="infra-conduit" d="M500 0V25Q500 45 480 45H180Q160 45 160 65V100M500 25Q500 45 520 45H820Q840 45 840 65V100M500 0V100" /><path className="infra-packet" pathLength="100" d="M500 0V25Q500 45 480 45H180Q160 45 160 65V100" /><path className="infra-packet infra-packet-alt" pathLength="100" d="M500 0V25Q500 45 520 45H820Q840 45 840 65V100" /></g></svg>;
}