import { useI18n } from "@/lib/i18n";
import { getMySnapchat, updateMySnapchat } from "@/lib/snapchat.functions";
import { useMemo, useState, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, AtSign, BadgeCheck, ChevronRight, Clapperboard, Briefcase, Link2, MessageCircle, Radio, Search, LayoutGrid } from "lucide-react";
import { BrandIcon } from "@/components/integrations/BrandIcon";
import { INTEGRATIONS, integrationById, type Integration } from "@/lib/integrations-catalog";
import { getMyIntegrations, saveIntegration } from "@/lib/integrations.functions";
import { getMyPresence, setSpotifyPresenceVisible } from "@/lib/presence.functions";
import { IntegrationVault } from "./IntegrationVault";
import { SocialVerifyPanel } from "@/components/dashboard/SocialVerifyPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isProfileSectionKind } from "@/lib/profile-section-blocks";
import { BLOCK_KINDS } from "@/lib/profile";
import { SocialPlatformIcon } from "@/lib/social-icons";
import { VideoBlockDialog } from "./VideoBlockDialog";
import { ProUpgradeModal } from "./ProUpgradeModal";
import { i18n as trI18n } from "@/lib/i18n";

/** Eén component uit de bibliotheek. `video` opent de embed/upload-keuze. */
interface LibraryItem {
  kind: string;
  label: string;
  note: string;
  isNew?: boolean;
  /** Subfilter in de bovenbalk van stap 2. */
  tag?: string;
}

interface LibraryGroup {
  id: string;
  title: string;
  items: LibraryItem[];
}

export const COMPONENT_LIBRARY: LibraryGroup[] = [
  {
    id: "standard",
    title: "🔗 Links & Socials",
    items: [
      { kind: "link", tag: "links", label: "Eigen link", note: "Elke webpagina" },
      { kind: "instagram", tag: "socials", label: "Socials icoon-rij", note: "Instagram, TikTok, X, LinkedIn, …" },
      { kind: "text", tag: "opmaak", label: "Tekst / Tussenkop", note: "Intro, kop of aankondiging", isNew: true },
      { kind: "spacer", tag: "opmaak", label: "Scheidingslijn / Spacer", note: "Rust tussen secties", isNew: true },
      { kind: "countdown", tag: "opmaak", label: "Aftelklok", note: "Tel af naar een lancering of event", isNew: true },
      { kind: "vcard", tag: "links", label: "vCard contactkaart", note: "Eén tik → in de contacten" },
    ],
  },
  {
    id: "media",
    title: "🎬 Media",
    items: [
      { kind: "video", tag: "video", label: "Video embed", note: "YouTube, Vimeo of TikTok", isNew: true },
      { kind: "media_gallery", tag: "foto", label: "Afbeelding / Galerij", note: "Foto's in een raster", isNew: true },
      { kind: "social_grid", tag: "foto", label: "Social Grid", note: "Raster van je posts en artikels, elke kaart met eigen link", isNew: true },
      { kind: "social_feed", tag: "socials", label: "Bluesky / Mastodon posts", note: "Je nieuwste posts automatisch op je profiel", isNew: true },
      { kind: "audio_player", tag: "audio", label: "Audio-speler", note: "MP3, podcast of ingesproken introductie", isNew: true },
      { kind: "spotify", tag: "audio", label: "Spotify / Audio embed", note: "Track, album of podcast", isNew: true },
      { kind: "soundcloud", tag: "audio", label: "SoundCloud embed", note: "Track of profiel" },
      { kind: "widget:youtube", tag: "video", label: "YouTube Kaart", note: "Kanaal, abonnees en nieuwste video's", isNew: true },
    ],
  },
  {
    id: "leads",
    title: "💬 Interactief & Widgets",
    items: [
      { kind: "newsletter", tag: "contact", label: "Nieuwsbrief", note: "Laat bezoekers inschrijven", isNew: true },
      { kind: "contact_form", tag: "contact", label: "Contactformulier", note: "Direct bericht", isNew: true },
      { kind: "feedback", tag: "community", label: "Feedback & Reviews", note: "Sterren en geschreven ervaringen", isNew: true },
      { kind: "live_poll", tag: "community", label: "Live Poll", note: "Stel je volgers een vraag" },
      { kind: "widget:questions", tag: "community", label: "Anonieme Vragenbox", note: "Laat bezoekers anoniem vragen stellen" },
      { kind: "widget:guestbook", tag: "community", label: "Prikbord / Guestbook", note: "Berichten van leden" },
      { kind: "widget:badges", tag: "profiel", label: "ROUT Badges", note: "Je verdiende badges" },
    ],
  },
  {
    id: "business",
    title: "💼 Zakelijk & Web3",
    items: [
      { kind: "calendly", tag: "agenda", label: "Calendly-boeking", note: "Laat mensen een moment kiezen", isNew: true },
      { kind: "booking_request", tag: "agenda", label: "Boekingsaanvraag", note: "Eigen tijdslots" },
      { kind: "matrix", tag: "chat", label: "Matrix chat", note: "Soeverein chatten" },
      { kind: "vault:lightning", tag: "crypto", label: "Bitcoin Lightning", note: "Ontvang sats" },
      { kind: "vault:monero", tag: "crypto", label: "Monero", note: "Publiek XMR-adres" },
      { kind: "vault:ethereum", tag: "crypto", label: "Ethereum", note: "Publiek 0x-adres" },
    ],
  },
];

export type WidgetId = "questions" | "guestbook" | "badges" | "reach" | "youtube";

/** Live kaarten die een koppeling uit de Integratiekluis hergebruiken. */
export const LIVE_COMPONENTS: { provider: string; note: string }[] = [
  { provider: "spotify", note: "Wat je nu luistert" },
  { provider: "github", note: "Recente pushes" },
  { provider: "gitlab", note: "Recente activiteit" },
  { provider: "wakatime", note: "Codeertijd" },
  { provider: "lichess", note: "Rating en partijen" },
  { provider: "chesscom", note: "Rating en partijen" },
  { provider: "duolingo", note: "Streak en taal" },
  { provider: "mastodon", note: "Laatste bericht" },
  { provider: "bluesky", note: "Laatste bericht" },
  { provider: "wsocial", note: "Laatste bericht" },
];

/** Curated mix voor "Aanbevolen". */
const SUGGESTED_KINDS = ["link", "instagram", "text", "video", "media_gallery", "social_grid", "spotify", "newsletter", "feedback", "widget:questions", "widget:badges", "widget:reach", "calendly", "booking_request"];
const SUGGESTED_LIVE = ["spotify", "github", "youtube", "bluesky", "wsocial", "lichess", "chesscom", "wakatime"];

type CategoryId = "standard" | "socials" | "media" | "leads" | "live" | "business" | "all";

const CATEGORIES: { id: CategoryId; title: string; note: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "socials", title: "Sociale media", note: "Instagram, TikTok, X, … — enkel je gebruikersnaam", icon: AtSign },
  { id: "standard", title: "Links & Tekst", note: "Eigen links, tekst en contactkaart", icon: Link2 },
  { id: "media", title: "Media", note: "Video, foto's en audio", icon: Clapperboard },
  { id: "leads", title: "Interactief & Widgets", note: "Nieuwsbrief, polls, vragen en badges", icon: MessageCircle },
  { id: "live", title: "Status & Feeds", note: "Live wat je nu doet: muziek, games, code…", icon: Radio },
  { id: "business", title: "Zakelijk & Web3", note: "Boekingen, chat en crypto", icon: Briefcase },
  { id: "all", title: "Alles", note: "Bekijk de volledige bibliotheek", icon: LayoutGrid },
];

const TAG_LABELS: Record<string, string> = {
  links: "Links", socials: "Socials", opmaak: "Tekst & opmaak", video: "Video", foto: "Foto's", audio: "Audio",
  contact: "Contact", community: "Community", profiel: "Profiel", agenda: "Agenda", chat: "Chat", crypto: "Crypto",
};

const LIVE_TABS: { id: string; label: string }[] = [
  { id: "music", label: "Muziek" },
  { id: "gaming", label: "Gaming" },
  { id: "streaming", label: "Streaming" },
  { id: "socials", label: "Socials" },
  { id: "work", label: "Werk & Code" },
  { id: "culture", label: "Cultuur & Vrije Tijd" },
  { id: "home", label: "Smart Home" },
  { id: "payments", label: "Support & Betalingen" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (kind: string, value?: string) => void;
  handle?: string;
  /** Zet een profielwidget (vragenbox, badges, …) aan. */
  onWidget?: (id: WidgetId) => void;
}

const ALL_ITEMS = COMPONENT_LIBRARY.flatMap((g) => g.items);

/** Alle social platformen: je vult enkel je gebruikersnaam in, de link maken wij. */
const SOCIAL_KINDS = BLOCK_KINDS.filter((k) => k.category === "socials" || k.category === "featured" || Boolean(k.tags?.length));

function SocialLogo({ kind }: { kind: string }) {
  return <SocialPlatformIcon source={kind} kind={kind} className="h-6 w-6" />;
}

/**
 * Component-bibliotheek in twee stappen: eerst een categorie kiezen,
 * daarna de lijst van die categorie met een filterbalk bovenaan.
 */
export function AddComponentModal({ open, onClose, onAdd, handle, onWidget }: Props) {
  const { t } = useI18n();
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [tab, setTab] = useState<string>("suggested");
  const [query, setQuery] = useState("");
  const [videoOpen, setVideoOpen] = useState(false);
  const [proOpen, setProOpen] = useState(false);
  /** null = catalogus; "all" = volledige kluis; anders één dienst. */
  const [vault, setVault] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [searchFocus, setSearchFocus] = useState(false);
  const qc = useQueryClient();
  const fetchPresence = useServerFn(getMyPresence);
  const fetchMine = useServerFn(getMyIntegrations);
  const fetchSnap = useServerFn(getMySnapchat);
  const showSnap = useServerFn(updateMySnapchat);
  const snapQuery = useQuery({ queryKey: ["my-snapchat"], queryFn: () => fetchSnap(), retry: false, enabled: open });
  const snap = snapQuery.data?.snap;
  const save = useServerFn(saveIntegration);
  const showSpotify = useServerFn(setSpotifyPresenceVisible);
  const presence = useQuery({ queryKey: ["my-presence"], queryFn: () => fetchPresence(), retry: false, enabled: open });
  const mine = useQuery({ queryKey: ["my-integrations"], queryFn: () => fetchMine(), retry: false, enabled: open });
  const spotify = presence.data?.connections.find((c) => c.provider === "spotify");
  const items = mine.data?.ready ? mine.data.items : [];
  const rowFor = (p: string) => items.find((i) => i.provider === p);

  const close = () => {
    setVault(null);
    setSearchFocus(false);
    setCategory(null);
    setTab("suggested");
    setQuery("");
    onClose();
  };
  const openCategory = (id: CategoryId) => {
    setCategory(id);
    setTab("suggested");
    setQuery("");
  };

  /** Gekoppeld → in 1 klik tonen; anders inline de kluis-koppelflow openen. */
  const pickLive = async (provider: string) => {
    const label = integrationById(provider)?.label ?? provider;
    setBusy(provider);
    try {
      if (provider === "snapchat") {
        if (!snap) { setVault(provider); return; }
        await showSnap({ data: { showCard: true } });
        await qc.invalidateQueries({ queryKey: ["my-snapchat"] });
      } else if (provider === "spotify" && spotify) {
        await showSpotify({ data: { show: true } });
        await qc.invalidateQueries({ queryKey: ["my-presence"] });
      } else {
        const row = rowFor(provider);
        // Username first: the component exists right away; official linking is offered in its row.
        if (provider !== "spotify") onAdd("live", provider);
        if (!row) return setVault(provider);
        const r = await save({ data: { provider, handle: row.handle, audience: row.audience, visible: true, useSso: row.verified } });
        if (!r.ok) throw new Error();
        await qc.invalidateQueries({ queryKey: ["my-integrations"] });
      }
      toast.success(`${label} staat op je profiel`);
      close();
    } catch {
      toast.error(trI18n.t("ui.cc2b708d99"));
    } finally {
      setBusy(null);
    }
  };

  const available = (item: LibraryItem) =>
    item.kind === "video" || item.kind.includes(":") || BLOCK_KINDS.some((k) => k.kind === item.kind);

  const q = query.trim().toLowerCase();
  const showLive = category === "live" || category === "all";
  const libraryPool = useMemo(() => {
    if (!category || category === "live") return [];
    const pool = category === "all" ? ALL_ITEMS : COMPONENT_LIBRARY.find((g) => g.id === category)?.items ?? [];
    return pool.filter(available);
  }, [category]);

  const tabs = useMemo(() => {
    const base = [{ id: "suggested", label: "⭐ Aanbevolen" }, { id: "all", label: "Alles" }];
    if (category === "socials") return [...base, ...[
      { id: "sovereign", label: t("studio.social.sovereign") },
      { id: "popular", label: t("studio.social.popular") },
      { id: "video", label: t("studio.social.video") },
      { id: "chat", label: t("studio.social.chat") },
      { id: "work", label: t("studio.social.work") },
    ]];
    if (category === "live") return [...base, ...LIVE_TABS];
    if (category === "all") return [...base, ...COMPONENT_LIBRARY.map((g) => ({ id: `g:${g.id}`, label: g.title.replace(/^\S+\s/, "") })), { id: "g:live", label: "Status & Feeds" }];
    const seen = [...new Set(libraryPool.map((i) => i.tag).filter((t): t is string => Boolean(t)))];
    return [...base, ...seen.map((t) => ({ id: `t:${t}`, label: TAG_LABELS[t] ?? t }))];
  }, [category, libraryPool, t]);

  const libraryList = libraryPool.filter((i) => {
    if (q) return i.label.toLowerCase().includes(q) || i.note.toLowerCase().includes(q);
    if (tab === "all") return true;
    if (tab === "suggested") return SUGGESTED_KINDS.includes(i.kind);
    if (tab.startsWith("t:")) return i.tag === tab.slice(2);
    if (tab.startsWith("g:")) return COMPONENT_LIBRARY.find((g) => g.id === tab.slice(2))?.items.includes(i) ?? false;
    return false;
  });

  const liveList: Integration[] = !showLive ? [] : (() => {
    if (q) return INTEGRATIONS.filter((i) => i.label.toLowerCase().includes(q) || i.id.includes(q));
    if (category === "all") {
      if (tab === "g:live" || tab === "all") return INTEGRATIONS;
      if (tab === "suggested") return SUGGESTED_LIVE.map((id) => integrationById(id)).filter((i): i is Integration => Boolean(i));
      return [];
    }
    if (tab === "all") return INTEGRATIONS;
    if (tab === "suggested") return SUGGESTED_LIVE.map((id) => integrationById(id)).filter((i): i is Integration => Boolean(i));
    return INTEGRATIONS.filter((i) => i.category === tab);
  })();

  const showSocials = category === "socials" || (category === "all" && (Boolean(q) || tab === "all" || tab === "suggested"));
  const socialList = !showSocials ? [] : SOCIAL_KINDS.filter((k) =>
    (!q || k.label.toLowerCase().includes(q) || k.kind.toLowerCase().includes(q)) &&
    (category !== "socials" || tab === "all" || (tab === "suggested" ? k.tags?.includes("popular") || k.tags?.includes("sovereign") : k.tags?.some((tag) => tag === tab))),
  );
  const pickSocial = (kind: string) => {
    close();
    onAdd(kind);
  };

  const pickItem = (item: LibraryItem) => {
    if (item.kind.startsWith("vault:")) return setVault(item.kind.slice(6));
    // "Socials icoon-rij" opens the full platform picker instead of adding Instagram directly.
    if (item.tag === "socials") return openCategory("socials");
    close();
    if (isProfileSectionKind(item.kind)) {
      if (onWidget && ["questions", "guestbook", "badges"].includes(item.kind.slice(7))) onWidget(item.kind.slice(7) as WidgetId);
      else onAdd(item.kind);
      return;
    }
    if (item.kind === "widget:youtube") { onAdd(item.kind); return; }
    if (item.kind.startsWith("widget:")) {
      const id = item.kind.slice(7) as WidgetId;
      if (onWidget) onWidget(id);
      else toast.info(`${item.label} beheer je verderop in de Studio`);
      return;
    }
    if (item.kind === "video") setVideoOpen(true);
    else onAdd(item.kind);
  };

  const current = CATEGORIES.find((c) => c.id === category);
  const title = vault ? "Integratiekluis" : current ? current.title : "Component toevoegen";

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && close()}>
        <DialogContent className="flex h-[85dvh] max-h-[90dvh] sm:h-[80vh] flex-col gap-3 overflow-hidden p-4 sm:max-w-2xl sm:p-6">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {vault ? (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              <button type="button" onClick={() => setVault(null)} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Terug naar de lijst
              </button>
              <IntegrationVault focus={vault === "all" ? undefined : vault} />
              {vault === "all" && handle && <SocialVerifyPanel handle={handle} />}
            </div>
          ) : !category ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Kies wat voor component je wilt toevoegen.</p>
                <button
                  type="button"
                  onClick={() => { openCategory("all"); setSearchFocus(true); }}
                  aria-label="Zoek een component"
                  title="Zoeken"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Search className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {CATEGORIES.map(({ id, title: t, note, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => openCategory(id)}
                    className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/30 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground group-hover:bg-background">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{t}</span>
                      <span className="block text-xs text-muted-foreground">{note}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <button type="button" onClick={() => { setCategory(null); setSearchFocus(false); }} className="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Alle categorieën
              </button>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={category === "live" ? "Zoek een dienst, bv. spo, git, ches…" : "Zoek in deze categorie…"}
                  aria-label="Zoeken"
                  className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              {!q && (
                <div role="tablist" aria-label="Filters" className="-mx-1 flex shrink-0 gap-1.5 overflow-x-auto px-1 pb-1">
                  {tabs.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.id}
                      onClick={() => setTab(t.id)}
                      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${tab === t.id ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                {libraryList.map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => pickItem(item)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        {item.kind === "social_grid" ? t("studio.grid.heading") : item.kind === "feedback" ? t("feedback.title") : item.label}
                        {item.isNew && (
                          <span className="rounded-full bg-muted px-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Nieuw</span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">{item.kind === "social_grid" ? t("studio.grid.libraryNote") : item.note}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                ))}
                {socialList.length > 0 && category === "all" && libraryList.length > 0 && (
                  <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sociale media</h3>
                )}
                {socialList.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {socialList.map((k) => (
                      <button
                        key={k.kind}
                        type="button"
                        onClick={() => pickSocial(k.kind)}
                        className="flex items-center gap-2.5 rounded-xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted"
                      >
                        <SocialLogo kind={k.kind} />
                        <span className="min-w-0 truncate text-sm font-medium">{k.label}</span>
                      </button>
                    ))}
                  </div>
                )}
                {liveList.length > 0 && category === "all" && libraryList.length > 0 && (
                  <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status &amp; Feeds</h3>
                )}
                {liveList.map((item) => {
                  const soon = item.mode === "soon";
                  const row = rowFor(item.id);
                  const linked = item.id === "snapchat" ? Boolean(snap) : item.id === "spotify" ? Boolean(spotify) : Boolean(row);
                  const account = item.id === "snapchat" ? snap?.displayName ?? "Snapchat" : item.id === "spotify" ? spotify?.accountName ?? "account" : row ? `@${row.handle.replace(/^@/, "")}` : "";
                  return (
                    <div key={item.id} className={`flex items-center gap-2.5 rounded-xl border border-border bg-background p-3 ${soon ? "opacity-60" : ""}`}>
                      <BrandIcon icon={item.icon} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 text-sm font-medium">
                          {item.label}
                          {row?.verified && <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-label="Geverifieerd" />}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {soon ? "Binnenkort" : linked ? `Gekoppeld · ${account}` : "Nog niet gekoppeld"}
                        </span>
                      </span>
                      {!soon && (
                        <button
                          type="button"
                          disabled={busy === item.id}
                          onClick={() => void pickLive(item.id)}
                          className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-muted disabled:opacity-50"
                        >
                          {linked ? "Op profiel zetten" : "Koppelen"}
                        </button>
                      )}
                    </div>
                  );
                })}
                {category === "live" && (
                  <p className="pt-2 text-center text-[11px] text-muted-foreground">
                    Live kaarten verschijnen alleen op je profiel terwijl je er echt mee bezig bent.{" "}
                    <button type="button" onClick={() => setVault("all")} className="underline underline-offset-2">Alle koppelingen beheren</button>
                  </p>
                )}
                {libraryList.length === 0 && liveList.length === 0 && socialList.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">Niets gevonden.</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <VideoBlockDialog
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        onAdd={(url) => onAdd("media_embed", url)}
        onPro={() => setProOpen(true)}
      />
      <ProUpgradeModal open={proOpen} onClose={() => setProOpen(false)} />
    </>
  );
}
