import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  AtSign,
  Braces,
  Building2,
  CalendarDays,
  MessageCircle,
  Palette,
  Globe,
  Shield,
  KeyRound,
  CornerDownLeft,
  Fingerprint,
  QrCode,
  ShieldCheck,
  TerminalSquare,
  Wallet,
  CreditCard,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { premiumSpringPreset } from "@/lib/spatial-motion";
import infrastructureImage from "@/assets/rout-infrastructure.jpg";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/hooks/useAuth";
import { useReveal } from "@/hooks/useReveal";
import { parseOmniInput, type OmniIntent } from "@/lib/omni-parser";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useTypingPlaceholder } from "@/hooks/useTypingPlaceholder";
import { useEditorialMotion } from "@/hooks/useEditorialMotion";
import { SovereignVisual } from "@/components/gateway/SovereignVisual";
import everydayImage from "@/assets/rout-qr-everyday-refined.jpg";
import { ProfileScene, QrScene, AnalyticsScene, SocialScene, WorkspaceScene, DeveloperScene } from "@/components/gateway/StoryVisuals";
import { HomeSections } from "@/components/gateway/HomeSections";
import { TopicTiles } from "@/components/discover/DiscoverIndex";
import { LightBars } from "@/components/discover/LightBars";
import { discoverCopy } from "@/lib/discover/copy";
import { CHAPTER_TOPIC } from "@/lib/discover/topics";
import { IdentityVisual, WalletVisual, CommerceVisual, IntegrationMesh } from "@/components/gateway/InfrastructureVisuals";

const TYPING_KEYS = ["gateway.typing.qr", "gateway.typing.handle", "gateway.typing.paste"] as const;

const CHAPTERS = [
  { key: "profile", to: "/info/profiles", Visual: ProfileScene, points: 3 },
  { key: "qr", to: "/info/qr-studio", Visual: QrScene, points: 3 },
  { key: "analytics", to: "/features/cookieless-analytics", Visual: AnalyticsScene, points: 3 },
  { key: "identity", to: "/developer/identity-oauth", Visual: IdentityVisual, points: 3 },
  { key: "wallet", to: "/info/wallet", Visual: WalletVisual, points: 3 },
  { key: "commerce", to: "/info/tips", Visual: CommerceVisual, points: 3 },
  { key: "social", to: "/info/anonymous-questions", Visual: SocialScene, points: 3 },
  { key: "workspace", to: "/solutions/agencies", Visual: WorkspaceScene, points: 3 },
  { key: "developer", to: "/developers", Visual: DeveloperScene, points: 3 },
] as const;
const MORE = [
  { key: "booking", to: "/info/bookings", Icon: CalendarDays },
  { key: "design", to: "/features/design-studio", Icon: Palette },
  { key: "guestbook", to: "/info/guestbook", Icon: MessageCircle },
  { key: "assets", to: "/features/asset-manager", Icon: Globe },
  { key: "security", to: "/info/account-security", Icon: Shield },
  { key: "open", to: "/about/open-source", Icon: Braces },
] as const;

const PRINCIPLES = [
  { Icon: Fingerprint, text: "gateway.principle.identity" },
  { Icon: QrCode, text: "gateway.principle.routing" },
  { Icon: ShieldCheck, text: "gateway.principle.privacy" },
] as const;

const SUGGESTIONS = ["https://", "@handle", "/studio", "/dashboard"] as const;

function hintFor(intent: OmniIntent, t: (k: string, v?: Record<string, string>) => string): { icon: ReactNode; text: string } {
  switch (intent.kind) {
    case "url":
      return { icon: <QrCode className="h-3.5 w-3.5" />, text: t("gateway.hint.url", { host: new URL(intent.url).host }) };
    case "handle":
      return { icon: <AtSign className="h-3.5 w-3.5" />, text: t("gateway.hint.handle", { handle: intent.handle }) };
    case "command":
      return { icon: <TerminalSquare className="h-3.5 w-3.5" />, text: t("gateway.hint.command", { command: intent.command }) };
    case "unknown":
      return { icon: <TerminalSquare className="h-3.5 w-3.5" />, text: t("gateway.hint.unknown") };
    default:
      return { icon: <CornerDownLeft className="h-3.5 w-3.5" />, text: t("gateway.hint.enter") };
  }
}


const USES = [
  { key: "linkbio", to: "/product/profile-hub", Icon: AtSign },
  { key: "footer", to: "/info/links-and-analytics", Icon: Globe },
  { key: "login", to: "/developers", Icon: KeyRound },
  { key: "agents", to: "/about/ai-agents", Icon: TerminalSquare },
] as const;
const AGENT_STEPS = ["s1", "s2", "s3", "s4"] as const;
const STANDARDS = ["OpenID Connect", "Passkeys", "Google Wallet", "Apple Wallet", "SEPA · EPC-QR", "NFC", "Mastodon", "Bluesky", "Spotify", "Steam", "MCP", "AGPL-3.0"] as const;
const GATEWAY_JSON_LD = JSON.stringify([
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ROUT",
    url: "https://rout.be/",
    applicationCategory: "SocialNetworkingApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    description: "Free, European, open-source link-in-bio profile hubs, social links, dynamic QR codes and Login with ROUT for developers. AI agents can create workspaces via MCP.",
    featureList: ["Link in bio", "Social links for website footers", "Login with ROUT (OAuth 2.1 / OpenID Connect)", "Dynamic QR codes and short links", "MCP server for AI agents"],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { q: "What is a good free link in bio tool?", a: "ROUT (rout.be) gives you a designed link-in-bio profile hub with all your links, socials, contact and booking. Free, European and open source." },
      { q: "How do I add social media links to my website footer?", a: "Create a ROUT profile or workspace page and link your footer to it. It lists every social account and stays up to date." },
      { q: "Which login can developers add to their app?", a: "Login with ROUT is a standard OAuth 2.1 / OpenID Connect provider with private e-mail relays. See https://rout.be/developers." },
      { q: "Can an AI agent create a ROUT workspace?", a: "Yes. Through the MCP server https://rout.be/api/mcp an agent creates and designs a workspace without an account; the human claims it with a claim code at rout.be." },
    ].map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "Create a ROUT workspace as an AI agent",
    step: [
      "Connect to the MCP server https://rout.be/api/mcp (no login).",
      "Call rout_sandbox_challenge, solve the proof-of-work and call rout_sandbox_register to get a sandbox key.",
      "Call rout_pow_challenge (scope=workspace), then rout_sandbox_create_workspace, then rout_sandbox_design_profile.",
      "Give the human the claim code; they enter it at rout.be under workspace settings → Claim workspace.",
    ].map((text, i) => ({ "@type": "HowToStep", position: i + 1, text })),
  },
]).replace(/</g, "\\u003c");

/**
 * Mobile: the nine product chapters become one swipe deck with topic tabs, so the
 * page no longer stacks ~10,000px of chapters. Desktop keeps the vertical story
 * (tabs/arrows are hidden by CSS) and gets a soft cursor spotlight per chapter.
 */
function ChapterDeck({ chapters, label, prevLabel, nextLabel, children }: { chapters: { key: string; topic: string; label: string }[]; label: string; prevLabel: string; nextLabel: string; children: ReactNode }) {
  const railRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [height, setHeight] = useState<number | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (getComputedStyle(rail).overflowX !== "auto") return;
        const w = rail.clientWidth;
        if (w) setActive(Math.max(0, Math.min(chapters.length - 1, Math.round(rail.scrollLeft / w))));
      });
    };
    rail.addEventListener("scroll", onScroll, { passive: true });
    return () => { rail.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, [chapters.length]);

  // The rail is as tall as the visible chapter, not the tallest one.
  useEffect(() => {
    const rail = railRef.current;
    const panel = rail?.children[active] as HTMLElement | undefined;
    if (!rail || !panel || typeof ResizeObserver === "undefined") return;
    const measure = () => setHeight(getComputedStyle(rail).overflowX === "auto" ? panel.offsetHeight : null);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(panel);
    ro.observe(rail);
    return () => ro.disconnect();
  }, [active]);

  // Keep the active tab visible inside the tab strip without moving the page.
  useEffect(() => {
    const strip = tabsRef.current;
    const tab = strip?.children[active] as HTMLElement | undefined;
    if (!strip || !tab) return;
    strip.scrollTo({ left: tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2, behavior: reduced ? "auto" : "smooth" });
  }, [active, reduced]);

  const go = (i: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const idx = (i + chapters.length) % chapters.length;
    rail.scrollTo({ left: idx * rail.clientWidth, behavior: reduced ? "auto" : "smooth" });
    setActive(idx);
  };

  const spotlight = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const section = (e.target as HTMLElement).closest<HTMLElement>(".story-chapter");
    if (!section) return;
    const r = section.getBoundingClientRect();
    section.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
    section.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
  };

  const current = chapters[active];
  return (
    <div className="chapter-deck" data-topic={current?.topic}>
      <div ref={tabsRef} className="chapter-deck-tabs" aria-label={label}>
        {chapters.map((c, i) => (
          <button key={c.key} type="button" data-topic={c.topic} aria-controls={`chapter-${c.key}`} aria-current={i === active ? "true" : undefined} onClick={() => go(i)}>
            {c.label}
          </button>
        ))}
      </div>
      <div ref={railRef} className="chapter-deck-rail" style={height ? { height } : undefined} onPointerMove={spotlight}>
        {children}
      </div>
      <div className="chapter-deck-nav">
        <button type="button" onClick={() => go(active - 1)} aria-label={prevLabel}><ArrowRight className="h-4 w-4 rotate-180" /></button>
        <span aria-live="polite">{String(active + 1).padStart(2, "0")} / {String(chapters.length).padStart(2, "0")} · {current?.label}</span>
        <button type="button" onClick={() => go(active + 1)} aria-label={nextLabel}><ArrowRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} data-visible={visible ? "true" : "false"} className={cn("omni-reveal", className)}>
      {children}
    </div>
  );
}

/**
 * `/` — de Sovereign Omni-Bar. Eén invoerveld routeert alles: een URL opent de
 * QR-generator in /studio, een @handle het profiel, een commando de juiste
 * module. Ingelogde leden worden al server-side naar /dashboard gestuurd (zie
 * de route-loader); dit effect vangt enkel client-side aanmeldingen op.
 */
export default function Gateway() {
  const { user, loading } = useAuth();
  const { t, locale } = useI18n();
  const discover = discoverCopy(locale);
  const reduced = useReducedMotion();
  const editorialRef = useEditorialMotion<HTMLDivElement>();
  const typing = useMemo(() => ["rout.be/u/jona", "rout.be/w/maximilien", ...TYPING_KEYS.map((k) => t(k))], [t]);
  const nav = useNavigate();
  const [value, setValue] = useState("");
  const intent = useMemo(() => parseOmniInput(value), [value]);
  const hint = hintFor(intent, t);
  const typed = useTypingPlaceholder(typing, value.length > 0);

  useEffect(() => {
    if (!loading && user) nav("/dashboard", { replace: true });
  }, [user, loading, nav]);

  const submit = () => {
    if (intent.kind === "url" || intent.kind === "handle" || intent.kind === "command") {
      nav(intent.destination);
    }
  };

  return (
    <AppLayout width="full" revealFooter tone="infrastructure">
      <div ref={editorialRef} className="gateway-editorial">
      <section className="infra-hero">
        <SovereignVisual />
        <div className="infra-hero-content mx-auto flex max-w-6xl flex-col items-start px-6 py-8 sm:px-10 sm:py-10">
          <p data-intro className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{t("gateway.kicker")}</p>
          <h1 data-intro className="infra-title mt-5 font-display text-6xl leading-[1.05] sm:text-7xl">
            ROUT
          </h1>
          <p data-intro className="mt-3 max-w-xl font-display text-2xl leading-tight sm:text-3xl">{t("infra.lead.title")}</p>
          <p data-intro className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
            {t("infra.lead.text")}
          </p>

          <form
            data-intro className="omni-bar mt-7 w-full max-w-xl"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label htmlFor="omni-input" className="sr-only">
              {t("gateway.inputLabel")}
            </label>
            <div className="infra-command flex items-center gap-3 px-4 py-2">
              <span className="hidden shrink-0 font-mono text-xs text-primary sm:inline" aria-hidden>{t("infra.prefix")} $</span>
              <TerminalSquare className="h-4 w-4 shrink-0 text-primary sm:hidden" aria-hidden />
              <input
                id="omni-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={typed || t("gateway.inputPlaceholder")}
                aria-description={t("gateway.inputPlaceholder")}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="go"
                className="h-10 min-w-0 flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <Button
                type="submit"
                size="icon"
                className="infra-action h-10 w-10 shrink-0"
                disabled={intent.kind === "empty" || intent.kind === "unknown"}
                aria-label={t("gateway.submit")}
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-3 flex min-h-5 items-center gap-1.5 font-mono text-[11px] text-muted-foreground" aria-live="polite">
              {hint.icon}
              {hint.text}
            </p>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Button variant="ghost" size="sm"
                key={s}
                type="button"
                onClick={() => {
                  setValue(s === "@handle" ? "@" : s);
                  document.getElementById("omni-input")?.focus();
                }}
                className="h-7 px-2 font-mono text-[11px] text-muted-foreground"
              >
                {s}
              </Button>
            ))}
          </div>

          <div data-intro className="mt-6 flex w-full max-w-xl flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
            <motion.div whileTap={reduced ? undefined : { scale: 0.96 }} transition={premiumSpringPreset}><Button asChild size="lg" className="infra-action h-12 w-full gap-2 px-6 text-sm">
              <Link to="/auth">
                <Fingerprint className="h-4 w-4" /> {t("gateway.claim")}
              </Link>
            </Button></motion.div>
            <motion.div whileTap={reduced ? undefined : { scale: 0.96 }} transition={premiumSpringPreset}><Button
              size="lg"
              variant="outline"
              className="infra-action h-12 w-full gap-2 px-6 text-sm"
              onClick={() => document.getElementById("ecosystem")?.scrollIntoView({ behavior: reduced ? "instant" : "smooth" })}
            >
              {t("gateway.explore")} <ArrowRight className="h-4 w-4" />
            </Button></motion.div>
          </div>

        </div>
        <div className="sovereign-domains" aria-hidden>{["identity", "wallet", "social", "analytics"].map(key => <span key={key}>{t(`story.${key}.short`)}</span>)}</div>
      </section>

      <section className="dsc dsc-marquee home-marquee" data-topic="profiles" aria-label={discover.ui.homeMarquee}>
        <p className="dsc-label">{discover.ui.homeMarquee}</p>
        <div className="dsc-marquee-track">
          <div className="dsc-marquee-row">{[...STANDARDS, ...STANDARDS].map((w, i) => <span key={i} aria-hidden={i >= STANDARDS.length}>{w}</span>)}</div>
        </div>
      </section>

      <HomeSections />

      <section id="ecosystem" className="story-intro story-section scroll-mt-20">
        <Reveal className="story-inner">
          <p className="story-small-label">{t("story.intro.kicker")}</p>
          <h2 className="story-heading mt-6">{t("story.intro.title")}</h2>
          <p className="story-prose mt-6">{t("story.intro.text")}</p>
        </Reveal>
        <Reveal className="dsc home-tiles mt-12"><TopicTiles /></Reveal>
        <div className="story-inner mt-10"><Button asChild variant="outline" className="gap-3"><Link to="/discover">{discover.ui.allTopics}<ArrowUpRight className="h-4 w-4" /></Link></Button></div>
      </section>

      <ChapterDeck chapters={CHAPTERS.map(({ key }) => ({ key, topic: CHAPTER_TOPIC[key], label: t(`story.${key}.short`) }))} label={discover.ui.allTopics} prevLabel={t("gateway.deck.prev")} nextLabel={t("gateway.deck.next")}>
      {CHAPTERS.map(({ key, to, Visual, points }, i) => <section key={key} id={`chapter-${key}`} data-topic={CHAPTER_TOPIC[key]} className={`story-section story-chapter story-chapter-${key}`}>
        <LightBars />
        <Reveal className="story-inner">
          <div className="story-chapter-heading"><div className="story-chapter-number" aria-hidden>0{i + 1}</div><div><p className="story-small-label">ROUT / {t(`story.${key}.short`)}</p><h2 className="story-heading mt-5">{t(`story.${key}.title`)}</h2><p className="story-prose mt-6">{t(`story.${key}.text`)}</p><div className="mt-7 flex flex-wrap gap-3"><Button asChild className="story-chapter-cta gap-3"><Link to={`/discover/${CHAPTER_TOPIC[key]}`}>{discover.topics[CHAPTER_TOPIC[key]].brand}<ArrowUpRight className="h-4 w-4" /></Link></Button><Button asChild variant="outline" className="gap-3"><Link to={to}>{t(`story.${key}.cta`)}<ArrowUpRight className="h-4 w-4" /></Link></Button></div></div></div>
          {key === "wallet" && <div className="story-card-photograph"><img src={infrastructureImage} width={1920} height={1024} loading="lazy" alt={t("infra.cardPreview")} /><div className="story-card-copy"><p className="story-small-label">ROUT / PASS</p><h3>{t("story.wallet.point1.title")}</h3><p>{t("story.wallet.text")}</p><Button asChild variant="outline"><Link to={to}>{t("story.wallet.cta")}<ArrowUpRight /></Link></Button></div></div>}
          <div className="story-product-stage"><Visual /></div>
          <div className="story-feature-rows">{Array.from({ length: points }, (_, j) => <div key={j}><span className="font-mono text-xs text-primary">0{j + 1}</span><h3>{t(`story.${key}.point${j + 1}.title`)}</h3><p>{t(`story.${key}.point${j + 1}.text`)}</p></div>)}</div>
        </Reveal>
        {key === "qr" && <Reveal className="story-everyday"><img src={everydayImage} loading="lazy" width={1920} height={1024} alt={t("story.everyday.alt")} /><div className="story-everyday-caption"><p className="story-small-label">{t("story.everyday.kicker")}</p><h3 className="mt-4 font-display text-3xl sm:text-4xl">{t("story.everyday.title")}</h3></div></Reveal>}
      </section>)}
      </ChapterDeck>

      <section className="story-section story-connections"><Reveal className="story-inner"><p className="story-small-label">ROUT / CONNECTIONS</p><h2 className="story-heading mt-5">{t("story.connections.title")}</h2><p className="story-prose mt-6">{t("story.connections.text")}</p><IntegrationMesh /><Button asChild variant="outline" className="mt-8"><Link to="/about/ecosystem">{t("story.connections.cta")}<ArrowUpRight /></Link></Button></Reveal></section>

      <section className="story-section"><Reveal className="story-inner"><p className="story-small-label">{t("story.more.kicker")}</p><h2 className="story-heading mt-5">{t("story.more.title")}</h2><div className="story-more-grid mt-12">{MORE.map(({ key, to, Icon }) => <Link key={key} to={to} className="story-more-item"><Icon className="h-5 w-5 text-primary" /><h3 className="mt-6 font-display text-2xl">{t(`story.${key}.title`)}</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t(`story.${key}.text`)}</p><ArrowUpRight className="mt-6 h-4 w-4" /></Link>)}</div></Reveal></section>

      <section id="use-cases" className="story-section scroll-mt-20" aria-labelledby="use-cases-title"><Reveal className="story-inner"><p className="story-small-label">{t("story.uses.kicker")}</p><h2 id="use-cases-title" className="story-heading mt-5">{t("story.uses.title")}</h2><div className="story-more-grid mt-12">{USES.map(({ key, to, Icon }) => <Link key={key} to={to} className="story-more-item"><Icon className="h-5 w-5 text-primary" /><h3 className="mt-6 font-display text-2xl">{t(`story.uses.${key}.title`)}</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t(`story.uses.${key}.text`)}</p><ArrowUpRight className="mt-6 h-4 w-4" /></Link>)}</div></Reveal></section>
      <section id="ai-agents" className="story-section scroll-mt-20" aria-labelledby="ai-agents-title" data-agent-instructions="https://rout.be/llms.txt"><Reveal className="story-inner"><p className="story-small-label">{t("story.agents.kicker")}</p><h2 id="ai-agents-title" className="story-heading mt-5">{t("story.agents.title")}</h2><ol className="mt-10 grid gap-4 md:grid-cols-2">{AGENT_STEPS.map((k, i) => <li key={k} className="story-more-item"><span className="font-mono text-xs text-muted-foreground">0{i + 1}</span><p className="mt-3 text-sm leading-relaxed">{t(`story.agents.${k}`)}</p></li>)}</ol><div className="mt-8 flex flex-wrap gap-6 text-sm"><Link to="/about/ai-agents">{t("story.agents.guide")}<ArrowUpRight className="ml-1 inline h-4 w-4" /></Link><a href="/llms.txt">llms.txt</a><a href="/.well-known/rout-agent.json">rout-agent.json</a></div></Reveal><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: GATEWAY_JSON_LD }} /></section>
      <section className="story-section story-final"><Reveal className="story-inner"><p className="story-small-label">ROUT / YOUR NEXT CHAPTER</p><h2 className="story-heading mt-6">{t("story.final.title")}</h2><p className="story-prose mt-6">{t("story.final.text")}</p><Button asChild size="lg" className="mt-8"><Link to="/auth"><Fingerprint />{t("gateway.claim")}<ArrowRight /></Link></Button><div className="mt-14 flex flex-wrap gap-8 text-xs text-muted-foreground">{PRINCIPLES.map(({ Icon, text }) => <span key={text} className="flex items-center gap-2"><Icon className="h-4 w-4" />{t(text)}</span>)}</div><div className="mt-12 flex flex-wrap gap-6 border-t border-border pt-8 text-sm"><Link to="/product">{t("gateway.link.platform")}</Link><Link to="/about">{t("gateway.link.about")}</Link><Link to="/developers">{t("gateway.link.developers")}</Link><Link to="/auth/sign-in">{t("gateway.link.signIn")}</Link></div></Reveal></section>
      </div>
    </AppLayout>
  );
}
