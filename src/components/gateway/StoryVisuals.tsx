import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowUpRight, Check, Fingerprint, Globe, Link2, Music2, ShieldCheck, CalendarDays, MessageCircle, Heart, Braces, Users } from "lucide-react";
import { SpatialChoice } from "@/components/ui/spatial-choice";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ProfileExampleDialog, type ProfileExampleAction } from "./ProfileExampleDialog";

export function ProfileScene() {
  const { t } = useI18n();
  const [action, setAction] = useState<ProfileExampleAction | null>(null);
  return <div className="story-profile-scene" aria-label={t("story.profile.title")}>
    <div className="story-orbit-label"><Globe /> rout.be / @you</div>
    <div className="story-profile-window acrylic-card">
      <div className="story-window-bar"><span>ROUT / PROFILE</span><span>{t("infra.example")}</span></div>
      <div className="story-profile-cover"><Fingerprint className="h-12 w-12" /></div>
      <div className="p-6 text-center"><h3 className="font-display text-3xl">{t("story.profile.demo")}</h3><p className="mt-2 text-xs text-muted-foreground">@you · ROUT ID</p>
        <div className="story-profile-links mt-6">{([{ key: "website", label: t("story.profile.website"), Icon: Globe }, { key: "booking", label: t("story.booking.title"), Icon: CalendarDays }, { key: "support", label: t("infra.support"), Icon: Heart }] as const).map(({ key, label, Icon }) => <Button key={key} variant="outline" className="h-auto min-h-12 w-full justify-start gap-3 whitespace-normal px-3 py-3 text-left text-xs" onClick={() => setAction(key)}><Icon />{label}<ArrowUpRight /></Button>)}</div>
      </div>
    </div>
    <div className="story-side-note"><Music2 className="text-primary" /><span>Live Presence<br /><small>Spotify · Last.fm</small></span></div>
    {action && <ProfileExampleDialog key={action} action={action} onClose={() => setAction(null)} />}
  </div>;
}

export function QrScene() {
  const { t } = useI18n();
  const [kind, setKind] = useState<"url" | "contact" | "wifi">("url");
  const values = { url: "https://rout.be/qr", contact: "BEGIN:VCARD\nVERSION:3.0\nFN:ROUT\nURL:https://rout.be\nEND:VCARD", wifi: "WIFI:T:WPA;S:ROUT-example;P:example-only;;" };
  return <div className="story-qr-scene">
    <div className="story-qr-tool acrylic-card"><div className="story-window-bar"><span>ROUT / QR STUDIO</span><span>{t("infra.example")}</span></div>
      <div className="p-5 sm:p-8"><SpatialChoice<"url" | "contact" | "wifi"> label={t("story.qr.types")} value={kind} onChange={setKind} options={[{ value: "url", label: <><Link2 />URL</> }, { value: "contact", label: <><Users />vCard</> }, { value: "wifi", label: <><Globe />Wi-Fi</> }]} />
      <div className="story-qr-workbench"><div className="space-y-6"><div><span className="story-small-label">{t("story.qr.destination")}</span><div className="spatial-input mt-3 break-all rounded-md p-4 font-mono text-xs">{kind === "url" ? values.url : kind === "contact" ? "ROUT / vCard 3.0" : "ROUT-example / WPA"}</div></div><div><span className="story-small-label">{t("story.qr.export")}</span><div className="mt-3 flex gap-4 font-mono text-sm"><span>SVG</span><span>PNG</span><span>PDF</span></div></div><p className="font-mono text-xs text-muted-foreground">{t("infra.localQr")}</p></div>
      <div className="story-qr-output"><QRCodeSVG value={values[kind]} size={168} marginSize={2} bgColor="transparent" fgColor="currentColor" /><span className="mt-4 font-mono text-xs">{kind.toUpperCase()} / ROUT</span></div></div></div>
    </div>
  </div>;
}

export function AnalyticsScene() {
  const { t } = useI18n();
  return <div className="story-analytics-scene acrylic-card"><div className="story-window-bar"><span>ROUT / ANALYTICS</span><span>{t("infra.example")}</span></div><div className="p-5 sm:p-9"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="story-small-label">{t("story.analytics.events")}</p><p className="mt-2 font-display text-4xl">1,284 <span className="font-mono text-xs text-primary">+24.8%</span></p></div><span className="font-mono text-xs text-muted-foreground">UTM · QR · LINKS</span></div><svg viewBox="0 0 900 240" role="img" aria-label={t("infra.sampleChart")} className="story-chart"><g className="stroke-border" fill="none"><path d="M0 40H900M0 100H900M0 160H900M0 220H900" /></g><path className="story-chart-area" d="M0 205L40 198L80 210L120 180L160 184L200 132L240 156L280 166L320 125L360 142L400 105L440 130L480 80L520 112L560 86L600 96L640 56L680 73L720 30L760 54L800 25L840 44L900 12V240H0Z" /><path className="story-chart-line" pathLength="100" d="M0 205L40 198L80 210L120 180L160 184L200 132L240 156L280 166L320 125L360 142L400 105L440 130L480 80L520 112L560 86L600 96L640 56L680 73L720 30L760 54L800 25L840 44L900 12" /></svg><div className="grid grid-cols-3 gap-4 border-t border-border pt-5 font-mono text-xs text-muted-foreground"><span>QR / 48%</span><span>DIRECT / 32%</span><span>SOCIAL / 20%</span></div></div></div>;
}

export function SocialScene() {
  const { t } = useI18n();
  return <div className="story-social-scene"><div className="story-question acrylic-card"><MessageCircle className="h-6 w-6 text-primary" /><span className="story-small-label">{t("story.social.questionLabel")}</span><h3 className="mt-5 font-display text-3xl">{t("story.social.question")}</h3><p className="mt-6 border-t border-border pt-5 text-sm leading-relaxed text-muted-foreground">{t("story.social.answer")}</p></div><div className="story-answer acrylic-card"><span className="story-small-label">ROUT / STORIES</span><Fingerprint className="my-8 h-16 w-16 text-primary" /><h3 className="font-display text-3xl">{t("story.social.share")}</h3><p className="mt-4 text-xs text-muted-foreground">{t("infra.example")}</p></div></div>;
}

export function WorkspaceScene() {
  const { t } = useI18n();
  return <div className="story-workspace-scene acrylic-card"><div className="story-window-bar"><span>ROUT / WORKSPACE</span><span>{t("infra.example")}</span></div><div className="story-workspace-body"><aside><Users className="mb-5 h-7 w-7 text-primary" /><span>workspace / studio</span><span>profiles</span><span>domains</span><span>members</span><span>scopes</span></aside><div className="min-w-0 p-5 sm:p-8"><p className="story-small-label">{t("story.workspace.demo")}</p><h3 className="mt-3 font-display text-3xl">studio.rout.be</h3><div className="mt-8 space-y-5">{["studio / brand", "team / creator", "campaign / QR"].map((name) => <div key={name} className="flex items-center gap-3 border-b border-border pb-4"><Globe className="h-4 w-4 text-primary" /><span className="min-w-0 flex-1 font-mono text-xs">{name}</span><Check className="h-4 w-4 text-primary" /></div>)}</div><p className="mt-6 font-mono text-xs text-muted-foreground">{t("infra.workspace.text")}</p></div></div></div>;
}

export function DeveloperScene() {
  return <div className="story-developer-scene"><div className="story-code acrylic-card"><div className="story-window-bar"><span><Braces className="inline h-4 w-4" /> ROUT / OPENID CONNECT</span><span>PKCE</span></div><pre className="p-6 sm:p-10"><code><span className="text-muted-foreground">// public discovery</span>{"\nGET /.well-known/openid-configuration\n\n"}<span className="text-primary">scope</span>{": openid profile\n"}<span className="text-primary">code_challenge_method</span>{": S256\n"}<span className="text-primary">response_type</span>{": code\n\n"}<span className="text-muted-foreground">{"// consent → authorization → token"}</span></code></pre></div><div className="story-protocols"><span><ShieldCheck />OpenID Connect</span><span><Braces />REST / MCP</span><span><Globe />Open web</span></div></div>;
}