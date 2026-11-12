import { clampWidgetRadius } from "@/lib/qa/design";
import { titleTypographyClass, titleTypographyStyle } from "@/lib/title-typography";
import { runCustomVisitEffect, normalizeVisitCustom } from "@/lib/visit-effect-custom";
import { COMPONENT_SCOPES, glassSurfaceStyle, resolveComponentDesign, resolveScopedTokens, scopeOfBlockKind } from "@/lib/theme-engine";
import { LiquidGlassFilters, useLiquidGlassRuntime } from "@/components/glass/LiquidGlass";
import { LocaleDropdown } from "@/components/LocaleDropdown";
import { profileSurface } from "@/lib/profile-surface";
import { profileImageSrc } from "@/lib/image-proxy-rules";
import { mastodonAvatarSrc } from "@/lib/mastodon-avatar";
import { socialHandleKey } from "@/lib/social-block-rules";
import { useTranslation } from "react-i18next";
import { ProfileYouTubeCard } from "@/components/profile/YouTubeCard";
import { ProfileFeedback } from "@/components/profile/FeedbackCard";
import { isProfileSectionKind, usesSectionFallback } from "@/lib/profile-section-blocks";
import { SteamCard } from "@/components/profile/SteamCard";
import { LastfmCard } from "@/components/profile/LastfmCard";
import { CustomStatusPill, NowPlaying, useNowPlaying } from "@/components/profile/NowPlaying";
import { SnapchatProfile } from "@/components/profile/SnapchatProfile";
import { SocialFeedCard } from "@/components/profile/SocialFeedCard";
import { VerifiedAccountCheck } from "@/components/profile/VerifiedAccountCheck";
import { ProfileIntegrations } from "@/components/profile/ProfileIntegrations";
import { ProfileGuestbook } from "@/components/profile/ProfileGuestbook";
import { QaStoryRing } from "@/components/qa/QaStoryRing";
import { ProfileQuestions } from "@/components/profile/ProfileQuestions";
import { TipJarButton } from "@/components/profile/TipJarButton";
import { ProfilePageTabs } from "@/components/profile/ProfilePageTabs";
import { useWireframeMode, WireframeOverlay } from "@/components/profile/WireframeMode";
import { cn } from "@/lib/utils";
import {
  backgroundLayerStyle,
  blockStyleOverride,
  identityOrderOf,
  profileHandleLabel,
  normalizeDesignLayers,
  sectionOrder,
  sectionVisible,
  type Decoration,
  type SectionId,
} from "@/lib/design-layers";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BadgeCheck, Mail, UserPlus, Users } from "lucide-react";
import {
  blockHref,
  isPromoBlock,
  isWidgetBlock,
  isPlainLinkKind,
  blockDisplay,
  resolveLinkMode,
  logoBarLayout,
  scheduledBlocks,
  applyVisibilityRules,
  liveStateFromPresence,
  nextScheduleBoundary,
  themeOf,
  type ProfileBlock,
  type ProfileRecord,
} from "@/lib/profile";
import {
  BookingBlock,
  NewsletterBlock,
  PromoBlock,
  isBookingUrl,
} from "@/components/profile/ProfileWidgets";
import { BookingCard } from "@/components/profile/BookingCard";
import { VisualWidgetCard } from "@/components/profile/VisualWidgetCard";
import { DragMarquee } from "@/components/community/DragMarquee";
import { isVisualWidget } from "@/lib/profile-widgets";
import { CountdownCard } from "@/components/profile/CountdownCard";
import { toast } from "sonner";
import { parseBookingConfig } from "@/lib/booking";
import { GalleryCard } from "@/components/profile/GalleryCard";
import { SocialGridCard } from "@/components/profile/SocialGridCard";
import { MediaEmbedCard } from "@/components/profile/MediaEmbedCard";
import { AudioBlockCard } from "@/components/profile/AudioBlockCard";
import { ContactFormCard } from "@/components/profile/ContactFormCard";
import { ProfileEventList } from "@/components/profile/EventListCard";
import { PollCard } from "@/components/profile/PollCard";
import { FaqCard } from "@/components/profile/FaqCard";
import { MapCard } from "@/components/profile/MapCard";
import { parseContactFormConfig } from "@/lib/contact-form";
import { parseEventListConfig } from "@/lib/events";
import { parseFaqConfig, parseMapConfig, parsePollConfig } from "@/lib/interactions";

import { parseGalleryConfig } from "@/lib/gallery";
import { parseSocialGridConfig } from "@/lib/social-grid";
import { SocialPlatformIcon } from "@/lib/social-icons";
import { PLATFORM_LABEL, formatFollowers } from "@/lib/social-verify";
import { formatReach } from "@/lib/total-reach";
import { FavoritesShowcase } from "@/components/profile/FavoritesShowcase";
import { ProfileTimeline } from "@/components/profile/ProfileTimeline";
import { BadgeShowcase } from "@/components/profile/BadgeShowcase";
import { ProfileBadge } from "@/components/profile/ProfileBadge";
import { ProfilePassport } from "@/components/profile/CustomBadgeRow";
import { ConnectedApps } from "@/components/profile/ConnectedApps";
import type { BadgeType } from "@/lib/profile-display";
import { MemberSinceBadge, PioneerBadge } from "@/components/profile/TrustBadges";
import {
  backgroundLayers,
  textureLayer,
  bannerStyleOf,
  blockButtonStyle,
  FONT_FAMILY,
  nameAccentStyle,
  parseDisplayPrefs,
  shouldShowWatermark,
  availableBioLocales,
  bioForLocale,
  BIO_LOCALE_LABEL,
  type BioLocale,
  designButtonStyle,
  buttonEffectClass,
  footerBlockStyle,
  fontPairingOf,
  wallpaperImageLayerStyle,
  wallpaperOverlayStyle,
  wallpaperStyle,
  ANIMATED_WALLPAPERS,
  avatarShapeStyle,
} from "@/lib/profile-display";
import {
  isVisitEffect,
  runVisitEffect,
  VISIT_EFFECT_TEST_EVENT,
} from "@/lib/visit-effects";
import { AvatarFrameWrapper } from "@/components/profile/AvatarFrameWrapper";
import { StatusBubble } from "@/components/profile/StatusBubble";
import { downloadVCard, parseVCardConfig } from "@/lib/vcard";
import { ShareMenu } from "@/components/profile/ShareMenu";
import { profileText } from "@/lib/profile-i18n";

import { useI18n } from "@/lib/i18n";
import { useServerFn } from "@tanstack/react-start";
import { recordLinkClickFn } from "@/lib/visits.functions";
import { initialsFrom } from "@/components/UserAvatar";

/** Swaps the browser tab icon for the profile's own favicon (or avatar). */
function useProfileFavicon(url?: string | null) {
  useEffect(() => {
    if (!url || typeof document === "undefined") return;
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = url;
    document.head.appendChild(link);
    return () => link.remove();
  }, [url]);
}

/** Renders a public ROUT link hub for both the /@handle and /u/@handle namespaces. */
export function ProfileView({
  profile,
  free = false,
  layout = "auto",
  publicPath,
  preview = false,
}: {
  profile: ProfileRecord;
  free?: boolean;
  /** Explicit public path (e.g. "/w/<slug>" for a workspace); overrides the /u/ vs root guess. */
  publicPath?: string;
  preview?: boolean;
  /** "wide" toont links in twee kolommen (desktopvoorbeeld / brede schermen). */
  layout?: "auto" | "wide";
}) {
  const { t: tx } = useTranslation();
  const shownPath = publicPath ?? (profile.username ? `/${free ? "u/" : ""}${profile.username}` : null);
  const { t: tr, locale } = useI18n();
  const sendClick = useServerFn(recordLinkClickFn);
  /** Anonieme klikmeting; faalt stil zodat een link altijd opent. */
  const trackClick = (blockId: string, label: string | null | undefined) => {
    if (preview || !profile.username) return;
    void sendClick({
      data: { handle: profile.username, blockId, label: label ?? null, space: free ? "alias" : "root" },
    }).catch(() => undefined);
  };
  const prefs = parseDisplayPrefs(profile.display_prefs);
  const t = profileSurface(themeOf(profile.theme), prefs.canvasColor ?? ((prefs.backgroundCustom || prefs.customDesign) && prefs.wallpaperType === "solid" ? prefs.wallpaperColor : null));
  const mastodonAccount = profile.blocks.find(block => block.kind === "mastodon" && block.value.trim());
  const avatarSrc = profileImageSrc(profile.avatar_url) ?? mastodonAvatarSrc(mastodonAccount?.value);
  const layers = normalizeDesignLayers(prefs.designLayers);
  const lv = (id: SectionId) => sectionVisible(layers, id);
  const sectionStyle = (id: SectionId) => ({ order: sectionOrder(layers, id), display: lv(id) ? undefined : "none" });
  const fxOn = lv("fx");
  // Re-render exactly when a scheduled block starts or expires (no reload needed).
  const [scheduleTick, setScheduleTick] = useState(0);
  useEffect(() => {
    const next = nextScheduleBoundary(profile.blocks);
    if (next === null) return;
    const id = window.setTimeout(() => setScheduleTick((n) => n + 1), Math.min(Math.max(next - Date.now(), 0) + 250, 2_147_000_000));
    return () => window.clearTimeout(id);
  }, [profile.blocks, scheduleTick]);
  const blocks = applyVisibilityRules(scheduledBlocks(profile.blocks), liveStateFromPresence(prefs.presence)).filter(
    (b) =>
      b.value.trim() !== "" ||
      b.kind === "newsletter" ||
      b.kind === "booking_request" ||
      b.kind === "spacer" || isProfileSectionKind(b.kind),
  );
  /** Bento mode only when the member gave at least one block a tile size. */
  const bento = blocks.some((b) => b.size || layers.blockStyles[b.id]?.width || layers.blockStyles[b.id]?.height);
  const bentoCell = (b: ProfileBlock, node: ReactNode) => {
    if (!bento || node === null) return node;
    const tile = layers.blockStyles[b.id];
    const narrow = tile?.width ? tile.width === 1 : b.size === "small";
    const span = narrow ? "col-span-1" : "col-span-2";
    return <div key={b.id} style={blockStyleOverride(tile)} className={cn("flex min-w-0 [&>*]:w-full", span, tile?.height === "medium" && "min-h-48 [&>*]:min-h-48", tile?.height === "tall" && "min-h-72 [&>*]:min-h-72", !tile?.height && b.size === "large" && "[&>*]:min-h-40")} data-tile={b.size ?? "row"}>{node}</div>;
  };
  const liveProviders = profile.blocks.filter((b) => b.kind === "live").map((b) => b.value);
  /** Accent-animatie op de gekozen hoofdlink (glow, pulse of shimmer). */
  const ctaClass = (blockId: string) => {
    if (prefs.ctaBlockId !== blockId || prefs.ctaEffect === "none") return "";
    if (prefs.ctaEffect === "pulse") return "animate-pulse";
    if (prefs.ctaEffect === "shimmer") return "animate-[pulse_2.4s_ease-in-out_infinite] brightness-110";
    return "shadow-[0_0_24px_-6px_currentColor] ring-1 ring-current";
  };
  const fonts = fontPairingOf(prefs.fontPairing);
  const buttonStyle = designButtonStyle(prefs, t) ?? blockButtonStyle(profile.card_style, t);
  /** Scoped theme engine: global glass tokens + per-component overrides. */
  const styleFor = (kind: string) => {
    const scope = scopeOfBlockKind(kind);
    const glass = glassSurfaceStyle(
      resolveScopedTokens(prefs, prefs.themeOverrides, scope),
      scope,
      prefs.glassTargets,
    );
    const design = resolveComponentDesign(prefs, prefs.themeOverrides, scope);
    const own = design.hasButtonOverride
      ? {
          ...(designButtonStyle({ ...design, buttonsCustom: true }, t) ?? {}),
          ...(prefs.themeOverrides[scope]?.fontPairing ? { fontFamily: fontPairingOf(design.fontPairing).body } : {}),
        }
      : scope !== "links" && scope !== "socials" ? { ...(buttonStyle ?? {}), borderRadius: Math.min(28, Number(buttonStyle?.borderRadius) || 12) } : buttonStyle;
    // Button text colour lives under Typography, so it applies even without custom button shapes.
    const withText = design.buttonTextColor ? { ...(own ?? {}), color: design.buttonTextColor } : own;
    const out = glass ? { ...(withText ?? {}), ...glass } : withText;
    return out && !isPlainLinkKind(kind) ? clampWidgetRadius(out) : out;
  };
  const linkMode = resolveLinkMode(layers.linkDisplay, prefs.buttonShape);
  const iconOnly = false;
  /** Per link: a button row, a logo in the bar under the bio, or both. */
  const iconLinks = blocks.filter((b) => isPlainLinkBlock(b) && !b.hidden && blockDisplay(b, linkMode).icon);
  const iconBar = logoBarLayout(iconLinks.length, layers.iconBarMode);
  /** Eigen canvas- en patroonkleuren overschrijven het thema, indien gekozen. */
  const canvas = {
    ...t,
    bg: prefs.canvasColor ?? t.bg,
    border: prefs.patternColor ?? t.border,
    accent: prefs.patternColor ?? t.accent,
  };
  const wallpaper = wallpaperStyle(prefs, canvas);
  const surface = wallpaper ?? backgroundLayers(prefs.backgroundStyle, canvas);
  /** Textuur (raster, ruis, …) bovenop een eigen achtergrond i.p.v. eronder te verdwijnen. */
  const texture = wallpaper ? textureLayer(prefs.backgroundStyle, canvas) : null;
  const animated = wallpaper && ANIMATED_WALLPAPERS.includes(prefs.wallpaperType) ? prefs.wallpaperType : null;
  const animAccent = canvas.accent ?? canvas.border;
  const imageLayer = wallpaperImageLayerStyle(prefs);
  const overlay = wallpaperOverlayStyle(prefs);
  const banner = bannerStyleOf(prefs, t);
  const nameStyle = nameAccentStyle(prefs.nameAccent, t);
  const avatarShape = avatarShapeStyle(prefs.avatarShape);
  /** Anonymous Q&A lives on personal canvases only (never on a workspace page). */
  const qaSpace: "root" | "alias" | null = publicPath?.startsWith("/w/") ? null : free ? "alias" : "root";

  // Het blauwe vinkje hoort uitsluitend bij het geverifieerde account op de
  // schone namespace (`rout.be/<handle>`). De aliasruimte (`rout.be/u/…`) van
  // datzelfde geverifieerde lid toont het mens-symbool: bewijs dat dit account
  // aan een geverifieerd, menselijk account gekoppeld is — zonder echte naam.
  // Aliasprofiel: het mens-symbool verschijnt wanneer het gekoppelde account
  // geverifieerd is (`human_linked`) en de eigenaar de badge niet uitzette.
  // Een via DNS geclaimde domeinnaam (`rout.be/example.be`) mag de zwarte
  // domeinbadge dragen.
  const claimedDomain = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(profile.subdomain_alias ?? "")
    ? (profile.subdomain_alias as string)
    : null;
  const showBadge = free
    ? Boolean(profile.human_linked) && prefs.humanBadgeVisible
    : // Blauw vinkje: alleen bij niveau 2 (wettelijke identiteit); oudere betaalde verificaties blijven gelden.
      Boolean(profile.verified) && profile.legal_identity_verified !== false && prefs.badgeVisible && prefs.badgeType !== "none";
  /**
   * Beide badges zijn vrij te kiezen: een geverifieerd lid mag het blauwe
   * vinkje (identiteit + land) of het privacy-schild (enkel "echte mens")
   * tonen, of de zwarte domeinbadge wanneer een domein geclaimd is — of niets.
   */
  const badgeType: BadgeType = free
    ? "human"
    : // Een goedgekeurd bedrijf draagt altijd de zwarte badge, een goedgekeurde
      // influencer de roze; beide zijn toegekend en dus niet vrij te kiezen.
      profile.is_business
      ? "domain"
      : profile.is_influencer
        ? "influencer"
        : prefs.badgeType === "influencer"
          ? "verified"
          : prefs.badgeType === "domain" && !claimedDomain
            ? "verified"
            : prefs.badgeType;
  const hasPro = profile.is_pro ?? Boolean(profile.verified);
  const showWatermark =
    shouldShowWatermark(hasPro, prefs) &&
    (hasPro ? prefs.showRoutBadge : true);
  const wide = layout === "wide";
  const earlyBeliever = Boolean(profile.is_early_believer);
  const [wireframe, setWireframe] = useWireframeMode();
  /** Taalpil: auto-detect via de sitetaal, bezoeker mag zelf wisselen. */
  const bioLocales = availableBioLocales(prefs);
  const [bioLocale, setBioLocale] = useState<BioLocale | null>(null);
  const shownBio = profile.profile_descriptions?.[bioLocale ?? locale] || bioForLocale(prefs, profile.bio, bioLocale ?? locale ?? "nl");
  const aliasEmail =
    profile.show_email_publicly && earlyBeliever && profile.username
      ? `${profile.username}@rout.be`
      : null;


  const socialRow = (profile.social_links ?? []).length > 0 && (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
      {(profile.social_links ?? []).map((link) => {
        const followers = formatFollowers(link.followerCount);
        const username = (link as { username?: string | null }).username ?? null;
        return (
          <span
            key={link.platform}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{ border: `1px solid ${t.border}`, color: t.muted }}
          >
            <a
              href={link.url}
              target="_blank"
              rel="me noopener noreferrer"
              title={PLATFORM_LABEL[link.platform]}
              className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-80"
            >
              <SocialPlatformIcon source={link.url} className="h-3.5 w-3.5 text-current" />
              {username && <span>@{username.replace(/^@/, "")}</span>}
              {followers && <span>{followers}  {tx("profile.followersLabel")} </span>}
            </a>
            <VerifiedAccountCheck name={profile.display_name || profile.username} platform={PLATFORM_LABEL[link.platform]} handle={username} className="h-3 w-3" theme={t} lastCheckedAt={(link as { lastSyncedAt?: string | null }).lastSyncedAt ?? null} followers={followers} profileHandle={profile.username} />
          </span>
        );
      })}
    </div>
  );

  const mainRef = useRef<HTMLElement | null>(null);
  const stopTestRef = useRef<(() => void) | null>(null);

  useProfileFavicon(profileImageSrc(profile.favicon_url) ?? avatarSrc);

  // Entree-effect: exact één keer bij het betreden van het profiel, en nooit
  // wanneer het besturingssysteem minder beweging vraagt. Het effect speelt
  // binnen deze pagina zelf, dus ook netjes binnen de Studio-preview.
  const customFx = prefs.visitEffectCustom;
  const customKey = JSON.stringify(customFx);
  useEffect(() => {
    if (!fxOn) return;
    if (customFx.enabled) return runCustomVisitEffect(customFx, { container: mainRef.current });
    if (prefs.visitEffect === "none") return;
    const stop = runVisitEffect(prefs.visitEffect, { container: mainRef.current });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.visitEffect, fxOn, customKey]);

  // "Test effect" in de Studio: speel het af in deze preview, niet over de
  // volledige studiopagina.
  useEffect(() => {
    if (!preview) return;
    const onTest = (event: Event) => {
      const detail = (event as CustomEvent<{ effect?: string; handled?: boolean; custom?: unknown }>).detail;
      if (detail?.custom) {
        detail.handled = true;
        stopTestRef.current?.();
        stopTestRef.current = runCustomVisitEffect(normalizeVisitCustom(detail.custom), { force: true, immediate: true, container: mainRef.current });
        return;
      }
      const effect = isVisitEffect(detail?.effect) ? detail.effect : prefs.visitEffect;
      if (effect === "none") return;
      if (detail) detail.handled = true;
      stopTestRef.current?.();
      stopTestRef.current = runVisitEffect(effect, {
        force: true,
        container: mainRef.current,
      });
    };
    window.addEventListener(VISIT_EFFECT_TEST_EVENT, onTest);
    return () => {
      window.removeEventListener(VISIT_EFFECT_TEST_EVENT, onTest);
      stopTestRef.current?.();
    };
  }, [prefs.visitEffect, preview]);

  useLiquidGlassRuntime();
  const lensTokens = [prefs, ...COMPONENT_SCOPES.map((s) => resolveScopedTokens(prefs, prefs.themeOverrides, s))];
  return (
    <>
    <LiquidGlassFilters tokens={lensTokens} />
    <main
      ref={mainRef}
      onClickCapture={preview ? (event) => {
        // Studio preview: links and forms stay inside the editor instead of navigating away.
        const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]");
        if (!anchor) return;
        const href = anchor.getAttribute("href") ?? "";
        if (href.startsWith("#")) return;
        event.preventDefault();
        event.stopPropagation();
        toast.info(tx("profile.previewNoNavigate"), { id: "preview-no-navigate" });
      } : undefined}
      data-profile-theme={t.id}
      className={`relative isolate min-h-screen w-full overflow-hidden px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] ${banner ? "pt-0" : "pt-[calc(3rem+env(safe-area-inset-top))]"} ${wireframe ? "rout-wireframe" : ""}`}
      style={{
        ...surface,
        color: t.text,
         fontFamily: prefs.typographyCustom || prefs.customDesign ? fonts.body : FONT_FAMILY[prefs.typography],
         fontSize: prefs.typographyCustom || prefs.customDesign ? `${prefs.fontScale}%` : undefined,
      }}
    >
      {shownPath && (
        <div className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))] z-10">
          <ShareMenu
            url={`https://rout.be${shownPath}`}
            handle={profile.username ?? shownPath.split("/").pop() ?? ""}
            name={profile.display_name ?? ""}
            bio={shownBio || profile.tagline}
            avatarUrl={profile.avatar_url}
            qrStyle={prefs.qrSettings ?? null}
            visitor
            className="backdrop-blur"
            style={{ borderColor: t.border, color: t.text, background: t.card }}
          />
        </div>
      )}
      {/* Achtergrondafbeelding + verduistering blijven binnen deze pagina:
          blur werkt op de afbeelding zelf, nooit op wat erachter staat. */}
      {imageLayer && (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={imageLayer} />
      )}
      {overlay && (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={overlay} />
      )}
      {animated && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-anim-${animated}`}
          style={{ ["--anim-a" as string]: animAccent, ["--anim-b" as string]: canvas.card, ["--anim-c" as string]: canvas.border }}
        />
      )}
      {texture && (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={texture} />
      )}
      {layers.backgrounds
        .filter((b) => b.visible)
        .map((b) => (
          <div key={b.id} aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={backgroundLayerStyle(b)} />
        ))}
      {banner && (
        <div
          aria-hidden
          className="-mx-4 mb-[-2.5rem] h-32 w-[calc(100%+2rem)] sm:h-40"
          style={{ ...banner, borderBottom: `1px solid ${t.border}` }}
        />
      )}
      <div
        className={`relative mx-auto flex w-full flex-col items-center ${wide ? "max-w-2xl" : "max-w-md"}`}
      >
        <div className="flex w-full flex-col items-center" style={sectionStyle("avatar")}>
        <div className="status-bubble-host relative inline-flex">
        <AvatarFrameWrapper
          frame={prefs.avatarFrame}
          theme={t}
          decoration={prefs.avatarDecoration}
          presence={prefs.presence}
          indicator={prefs.presenceIndicator}
          emoji={prefs.presenceEmoji}
        >
          <QaStoryRing enabled={prefs.pulseRing} shapeClassName={avatarShape.className} shapeStyle={avatarShape.style} handle={qaSpace ? profile.username ?? null : null} space={qaSpace ?? "root"} displayName={profile.display_name ?? null} avatarUrl={profile.avatar_url ?? null}>
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt={profile.display_name || `@${profile.username}`}
              className={`${avatarShape.className} object-cover`}
              style={{ width: prefs.avatarSize, height: prefs.avatarSize, border: `1px solid ${t.border}`, ...(avatarShape.style ?? {}) }}
              loading="lazy"
            />
          ) : (
            <div
              className={`flex items-center justify-center text-xl font-medium ${avatarShape.className}`}
              style={{
                width: prefs.avatarSize,
                height: prefs.avatarSize,
                background: t.card,
                border: `1px solid ${t.border}`,
                ...(avatarShape.style ?? {}),
              }}
            >
              {initialsFrom(profile.display_name || profile.username)}
            </div>
          )}
          </QaStoryRing>
        </AvatarFrameWrapper>
        <ProfileStatus handle={profile.username ?? null} prefs={prefs} background={t.card} />
        </div>

        <div className="flex w-full flex-col items-center">
        <h1
          className="mt-4 flex max-w-full flex-wrap items-center justify-center gap-1.5 break-words text-center font-display text-2xl"
          style={{ order: identityOrderOf(layers, "name"), ...(prefs.typographyCustom || prefs.customDesign ? { fontFamily: fonts.heading, fontSize: `${prefs.titleScale}%`, letterSpacing: prefs.titleLetterSpacing } : {}) }}
        >
          <span
            key={`${prefs.titleEntrance}-${prefs.titleReveal}`}
            className={prefs.typographyCustom || prefs.customDesign ? titleTypographyClass(prefs) || undefined : undefined}
            style={(prefs.typographyCustom || prefs.customDesign) && (prefs.titleColor || prefs.titleGradientTo || prefs.titleShadowBlur || prefs.titleShadowX || prefs.titleShadowY || prefs.titleEffect !== "none" || prefs.titleEntrance !== "none") ? titleTypographyStyle(prefs, t.text) : nameStyle}
          >
            {profile.display_name || `@${profile.username}`}
          </span>
          {showBadge && (
            <ProfileBadge
              type={badgeType}
              legalName={
                free ? null : (profile.verified_legal_name ?? profile.display_name ?? null)
              }
              country={free ? null : (profile.country_code ?? null)}
              domain={claimedDomain}
              nameFormat={prefs.badgeNameFormat}
              backdrop={prefs.badgeBackdrop}
              backdropColor={prefs.badgeBackdropColor}
              verifiedAt={profile.verified_at ?? null}
              size={earlyBeliever ? "md" : "sm"}
              cardBg={t.card}
              cardBorder={t.border}
              textColor={t.text}
              mutedColor={t.muted}
            />
          )}
          {earlyBeliever && (
            <PioneerBadge
              badgeId={profile.early_believer_id ?? null}
              grantedAt={profile.early_believer_at ?? null}
              fallbackDate={profile.created_at ?? null}
              locale={locale || "nl"}
              theme={t}
            />
          )}
          <ProfilePassport handle={profile.username} theme={t} compact />
          {profile.username && <ConnectedApps handle={profile.username} compact />}
        </h1>
{/* Fixed header order: name, @handle, location, bio, link icons — then everything else. */}
        {/* Gratis leden tonen hun alias-namespace, Pro-leden hun schone handle.
            De subtitel is een subtiele link naar het live profiel. Een workspace
            heeft bewust géén username (username: null) — dan valt deze regel weg. */}
        {shownPath && (
          <a
            href={`https://rout.be${shownPath}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 break-all text-center font-mono text-sm underline-offset-4 transition-opacity hover:underline hover:opacity-80"
            style={{ color: t.muted, order: identityOrderOf(layers, "handle") }}
          >
            {profileHandleLabel(shownPath)}
          </a>
        )}
        {prefs.locationVisible && prefs.locationBadge && (
          <span
            className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium"
            style={{ border: `1px solid ${t.border}`, color: t.muted, order: identityOrderOf(layers, "location") }}
          >
            {prefs.locationBadge}
          </span>
        )}

        {(shownBio || profile.tagline) && (
          <p className="mt-3 max-w-sm text-balance text-center text-sm" style={{ color: t.muted, order: identityOrderOf(layers, "bio") }}>
            {shownBio || profile.tagline}
          </p>
        )}

        </div>
        {iconLinks.length > 0 && (() => {
          const logo = (b: ProfileBlock) => (
              <a key={b.id} href={blockHref(b)} target="_blank" rel="noopener noreferrer" onClick={() => trackClick(b.id, b.label)} aria-label={b.label} title={b.label}
                className={cn("flex h-11 w-11 shrink-0 items-center justify-center transition-transform hover:-translate-y-0.5", ctaClass(b.id))}
                style={{ ...styleFor(b.kind), borderRadius: 999, padding: 0, minHeight: 0 }}>
                {b.thumbnailUrl ? <img src={b.thumbnailUrl} alt="" className="h-6 w-6 rounded-full object-cover" loading="lazy" /> : <SocialPlatformIcon source={blockHref(b) || b.kind} iconMode={b.iconMode} className="h-5 w-5 text-current" />}
              </a>
          );
          return iconBar === "scroll" ? (
            <nav aria-label={tx("profile.links", { defaultValue: "Links" })} className="mt-4 w-full max-w-sm" data-logo-bar="scroll">
              <DragMarquee speed={24}>{iconLinks.map(logo)}</DragMarquee>
            </nav>
          ) : (
            <nav aria-label={tx("profile.links", { defaultValue: "Links" })} className="mt-4 flex max-w-sm flex-wrap items-center justify-center gap-2.5" data-logo-bar="wrap">
              {iconLinks.map(logo)}
            </nav>
          );
        })()}
        {profile.username && <ProfilePageTabs handle={profile.username} theme={t} />}
        {profile.fediverse && <a href={profile.fediverse.url} rel="me noopener noreferrer" target="_blank" className="mt-2 inline-flex max-w-full items-center gap-1.5 text-sm text-foreground">
          <span className="truncate">Mastodon</span>
          {profile.fediverse.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Mastodon-eigendom geverifieerd" />}
        </a>}
        {profile.username && <SnapchatProfile handle={profile.username} theme={t} buttonStyle={styleFor("live")} ownerName={profile.display_name || profile.username} />}
        {profile.username && <CustomStatusPill handle={profile.username} theme={t} />}
        {profile.username && <NowPlaying handle={profile.username} theme={t} />}
        {profile.username && prefs.steamPresence && <SteamCard handle={profile.username} theme={t} effects={prefs.cardEffects} />}
        {profile.username && prefs.lastfmPresence && <LastfmCard handle={profile.username} theme={t} />}
        {profile.username && <ProfileIntegrations handle={profile.username} theme={t} buttonStyle={styleFor("live")} exclude={liveProviders} />}
        {profile.username && usesSectionFallback(profile.blocks, "widget:youtube") && <ProfileYouTubeCard handle={profile.username} theme={t} cardStyle={styleFor("widget:youtube")} />}
        {profile.username && <TipJarButton handle={profile.username} theme={t} />}
        <ProfilePassport handle={profile.username} theme={t} />
        {profile.username && <ConnectedApps handle={profile.username} />}
        {profile.username && !profile.blocks.some(b => b.kind === "event_list") && <ProfileEventList handle={profile.username} space={free ? "alias" : "root"} style={styleFor("event_list")} />}
        {profile.username && !profile.blocks.some(b => b.kind === "feedback") && <ProfileFeedback handle={profile.username} space={free ? "alias" : "root"} style={styleFor("feedback")} />}

        {earlyBeliever && (
          <PioneerBadge
            variant="stamp"
            badgeId={profile.early_believer_id ?? null}
            grantedAt={profile.early_believer_at ?? null}
            fallbackDate={profile.created_at ?? null}
            locale={locale || "nl"}
            theme={t}
          />
        )}
        <MemberSinceBadge
          createdAt={profile.created_at_iso ?? profile.created_at ?? null}
          stamp={profile.genesis_stamp ?? null}
          label={tr("profile.member_since")}
          locale={locale || "nl"}
          theme={t}
        />
        {aliasEmail && (
          <a
            href={`mailto:${aliasEmail}`}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
            style={{ border: `1px solid ${t.border}`, color: t.text }}
          >
            <Mail className="h-3.5 w-3.5" aria-hidden />  {tx("profile.contactVia")} {aliasEmail}
          </a>
        )}

        {usesSectionFallback(profile.blocks, "widget:reach") && profile.show_total_reach && (profile.total_reach_count ?? 0) > 0 && (
          <span
            className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ border: `1px solid ${t.border}`, color: t.text }}
          >
            <Users className="h-3.5 w-3.5" aria-hidden />
            {formatReach(profile.total_reach_count ?? 0)}  {tx("profile.reachLabel")} </span>
        )}

        {bioLocales.length > 1 && (
          <div className="mt-2 flex items-center gap-1">
            {bioLocales.map((l) => {
              const active = (bioLocale ?? locale) === l;
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => setBioLocale(l)}
                  aria-pressed={active}
                  className="rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-widest transition-opacity hover:opacity-80"
                  style={{
                    border: `1px solid ${t.border}`,
                    background: active ? t.text : "transparent",
                    color: active ? t.bg : t.muted,
                  }}
                >
                  {BIO_LOCALE_LABEL[l]}
                </button>
              );
            })}
          </div>
        )}

        {/* vCard: bezoekers bewaren het profiel meteen in hun adresboek. */}
        {prefs.showVcardButton && !blocks.some((b) => b.kind === "vcard") && (
          <button
            type="button"

            onClick={() =>
              downloadVCard({
                handle: profile.username ?? "",
                displayName: profile.display_name,
                tagline: profile.tagline,
                bio: prefs.vcardIncludeBio ? shownBio : null,
                avatarUrl: prefs.vcardIncludeAvatar ? profile.avatar_url : null,
                email: prefs.vcardIncludeEmail ? aliasEmail : null,
                phone: prefs.vcardPhone,
                org: prefs.vcardOrg,
                profileUrl:
                  typeof window === "undefined"
                    ? `https://rout.be/${profile.username ?? ""}`
                    : window.location.href,
                links: prefs.vcardIncludeLinks
                  ? blocks
                      .filter((b) => /^https?:\/\//.test(blockHref(b)))
                      .map((b) => ({ label: b.kind, url: blockHref(b) }))
                  : [],
              })
            }
            className="group mt-3 inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-xs font-medium shadow-sm transition-all hover:-translate-y-px hover:shadow-md"
            style={{ border: `1px solid ${t.border}`, color: t.text }}
          >
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full transition-transform group-hover:scale-105"
              style={{ backgroundColor: t.border, color: t.text }}
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
            </span>
            {prefs.vcardLabel?.trim() || profileText(locale, "saveContact")}
          </button>
        )}


        {prefs.timelineVisible && <ProfileTimeline userId={profile.id} theme={t} />}

        <FavoritesShowcase favorites={prefs.favorites} theme={t} layout={prefs.favoritesLayout} />

        {/* Geverifieerde socials met gecachte volgeraantallen (0 externe calls).
            Mode 1 = icoon + gebruikersnaam met vinkje ernaast; mode 2 = alleen
            het icoon met een micro-vinkje over de rechterbovenhoek. */}
        {prefs.socialPosition === "top" && socialRow}
        </div>

        <div className="flex w-full flex-col items-center" style={sectionStyle("blocks")}>

         <div className={`mt-8 grid w-full gap-3 ${bento ? "grid-cols-2" : wide ? "lg:grid-cols-2" : "grid-cols-1"}`}>
          {blocks.length === 0 && (
            <p className="text-center text-sm" style={{ color: t.muted }}>
               {tx("profile.noLinks")} </p>
          )}
          {blocks.filter((b) => !isPlainLinkBlock(b) || blockDisplay(b, linkMode).button).map((b) => bentoCell(b,
            b.kind === "widget:questions" ? (
              profile.username && qaSpace && prefs.questionsEnabled && prefs.qaOnHub ? <div key={b.id} className="w-full"><ProfileQuestions handle={profile.username} space={qaSpace} theme={t} prefs={prefs} preview={preview} /></div> : null
            ) : b.kind === "widget:guestbook" ? (
              profile.username && prefs.guestbookEnabled ? <div key={b.id} className="w-full lg:col-span-full"><ProfileGuestbook handle={profile.username} theme={t} /></div> : null
            ) : b.kind === "widget:badges" ? (
              prefs.badgeShowcaseVisible ? <div key={b.id} className="w-full lg:col-span-full"><BadgeShowcase userId={profile.id} theme={t} /></div> : null
            ) : b.kind === "widget:youtube" ? (
              profile.username ? <div key={b.id} className="w-full lg:col-span-full"><ProfileYouTubeCard handle={profile.username} theme={t} cardStyle={styleFor(b.kind)} /></div> : null
            ) : b.kind === "feedback" ? (
              profile.username && b.value ? <div key={b.id} className="w-full lg:col-span-full"><ProfileFeedback handle={profile.username} space={free ? "alias" : "root"} formId={b.value} style={styleFor(b.kind)} /></div> : null
            ) : b.kind === "live" ? (
              profile.username ? <div key={b.id} className="w-full lg:col-span-full"><ProfileIntegrations handle={profile.username} theme={t} buttonStyle={styleFor(b.kind)} provider={b.value} stats={b.stats} /></div> : null
            ) : b.kind === "widget:reach" ? (
              profile.show_total_reach && (profile.total_reach_count ?? 0) > 0 ? <div key={b.id} className="flex w-full items-center justify-center gap-1.5 text-sm lg:col-span-full"><Users className="h-4 w-4" aria-hidden />{formatReach(profile.total_reach_count ?? 0)}  {tx("profile.reachLabel")} </div> : null
            ) : b.kind === "spacer" ? (
              <div key={b.id} className="h-6 w-full" aria-hidden />
            ) : b.kind === "text" ? (
              <p
                key={b.id}
                className="w-full whitespace-pre-line px-2 py-1 text-center text-sm leading-relaxed"
                style={{ color: t.muted }}
              >
                {b.value}
              </p>
            ) : isPromoBlock(b.kind) ? (
              <PromoBlock
                key={b.id}
                href={blockHref(b)}
                label={b.label}
                badge={b.badge}
                expiresAt={b.expiresAt}
                style={styleFor(b.kind)}
                accent={t.accent ?? t.border ?? "currentColor"}
              />
            ) : isWidgetBlock(b.kind) || isBookingUrl(blockHref(b)) ? (
              isVisualWidget(b.kind) ? (
                <VisualWidgetCard key={b.id} kind={b.kind} label={b.label} value={b.value} style={styleFor(b.kind)} />
              ) : b.kind === "countdown" ? (
                <CountdownCard key={b.id} label={b.label} value={b.value} style={styleFor(b.kind)} />
              ) : b.kind === "media_gallery" ? (
                <GalleryCard key={b.id} config={parseGalleryConfig(b.value)} style={styleFor(b.kind)} />
              ) : b.kind === "social_grid" ? (
                <div key={b.id} className="w-full lg:col-span-full"><SocialGridCard config={parseSocialGridConfig(b.value)} style={styleFor(b.kind)} /></div>
              ) : b.kind === "social_feed" ? (
                <SocialFeedCard key={b.id} value={b.value} style={styleFor(b.kind)} profile={profile.username ?? ""} blockId={String(b.id)} />
              ) : b.kind === "media_embed" ? (
                <MediaEmbedCard key={b.id} value={b.value} style={styleFor(b.kind)} />
              ) : b.kind === "audio_player" ? (
                <AudioBlockCard key={b.id} value={b.value} style={styleFor(b.kind)} />
              ) : b.kind === "contact_form" ? (
                <ContactFormCard
                  key={b.id}
                  handle={profile.username ?? ""}
                  config={parseContactFormConfig(b.value)}
                  style={styleFor(b.kind)}
                />
              ) : b.kind === "event_list" ? (
                <ProfileEventList
                  key={b.id}
                  handle={profile.username ?? ""}
                  space={free ? "alias" : "root"}
                  config={parseEventListConfig(b.value)}
                  style={styleFor(b.kind)}
                />
              ) : b.kind === "live_poll" ? (
                <PollCard
                  key={b.id}
                  pollKey={`${profile.username ?? "anon"}:${b.id}`}
                  config={parsePollConfig(b.value)}
                  style={styleFor(b.kind)}
                />
              ) : b.kind === "vcard" ? (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    const c = parseVCardConfig(b.value);
                    void downloadVCard({
                      handle: profile.username ?? "",
                      displayName: profile.display_name,
                      tagline: profile.tagline,
                      note: c.noteUseBio ? shownBio || profile.tagline || null : c.note.trim() || null,
                      avatarUrl: c.includeAvatar ? profile.avatar_url : null,
                      email: c.includeEmail ? aliasEmail : null,
                      phones: c.phones,
                      org: c.org,
                      title: c.title,
                      address: c.address,
                      profileUrl:
                        c.urlOverride ||
                        (typeof window === "undefined" ? `https://rout.be/${profile.username ?? ""}` : window.location.origin + window.location.pathname),
                      links: c.includeLinks
                        ? blocks.filter((x) => /^https?:\/\//.test(blockHref(x))).map((x) => ({ label: x.kind, url: blockHref(x) }))
                        : [],
                    });
                  }}
                  className="flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-transform hover:-translate-y-px"
                  style={styleFor(b.kind)}
                >
                  <UserPlus className="h-4 w-4" aria-hidden />
                  {parseVCardConfig(b.value).label.trim() || profileText(locale, "saveContact")}
                </button>
              ) : b.kind === "faq_accordion" ? (
                <FaqCard key={b.id} config={parseFaqConfig(b.value)} style={styleFor(b.kind)} />
              ) : b.kind === "map_embed" ? (
                <MapCard key={b.id} config={parseMapConfig(b.value)} style={styleFor(b.kind)} />
              ) : b.kind === "booking_request" ? (
                <BookingCard
                  key={b.id}
                  handle={profile.username ?? ""}
                  config={parseBookingConfig(b.value)}
                  style={styleFor(b.kind)}
                />
              ) : b.kind === "newsletter" ? (
                <NewsletterBlock
                  key={b.id}
                  handle={profile.username ?? ""}
                  label={b.label}
                  style={styleFor(b.kind)}
                />
              ) : (
                <BookingBlock key={b.id} href={blockHref(b)} label={b.label} style={styleFor(b.kind)} />
              )
            ) : (
              <a
                key={b.id}
                href={blockHref(b)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackClick(b.id, b.label)}
                aria-label={iconOnly ? b.label : undefined}
                title={iconOnly ? b.label : undefined}
                className={cn(
                  iconOnly
                    ? "flex h-14 w-14 items-center justify-center self-center transition-opacity hover:opacity-80"
                    : "flex min-h-12 w-full items-center gap-3 px-4 py-3 text-sm font-medium transition-opacity hover:opacity-80",
                  buttonEffectClass(prefs.buttonEffect),
                  ctaClass(b.id),
                )}
                style={{ ...styleFor(b.kind), ...blockStyleOverride(layers.blockStyles[b.id]), ...(iconOnly ? { borderRadius: 999, padding: 0, minHeight: 0 } : null) }}
              >
                {b.thumbnailUrl ? (
                  <img
                    src={b.thumbnailUrl}
                    alt=""
                    className="h-6 w-6 shrink-0 rounded-md object-cover"
                    loading="lazy"
                  />
                ) : (
                  <SocialPlatformIcon
                    source={blockHref(b) || b.kind}
                    iconMode={b.iconMode}
                    className="h-4 w-4 text-current"
                  />
                )}
                {!iconOnly && <span className="min-w-0 flex-1 truncate text-center">{b.label}</span>}
                {(profile.social_links ?? []).filter(link => link.isVerified && link.platform === b.kind && socialHandleKey(link.username) === socialHandleKey(b.value)).slice(0, 1).map(link => (
                  <span key={link.platform} className="inline-flex items-center gap-1 text-emerald-500">
                    <VerifiedAccountCheck name={profile.display_name || profile.username} platform={PLATFORM_LABEL[link.platform]} handle={link.username} className="h-4 w-4" theme={t} />
                    {link.followerCount !== null && <span className="text-xs">{formatFollowers(link.followerCount)}</span>}
                  </span>
                ))}
              </a>
            ),
          ))}
        </div>

        {profile.username && prefs.guestbookEnabled && usesSectionFallback(profile.blocks, "widget:guestbook") && <ProfileGuestbook handle={profile.username} theme={t} />}
        {profile.username && qaSpace && prefs.questionsEnabled && prefs.qaOnHub && usesSectionFallback(profile.blocks, "widget:questions") && <ProfileQuestions handle={profile.username} space={qaSpace} theme={t} prefs={prefs} preview={preview} />}
        {usesSectionFallback(profile.blocks, "widget:badges") && prefs.badgeShowcaseVisible && <BadgeShowcase userId={profile.id} theme={t} />}

        {prefs.socialPosition === "bottom" && socialRow}
        </div>

        <footer
          className="mt-10 flex w-full flex-col items-center gap-2"
          style={{
            ...footerBlockStyle(prefs.footerStyle, prefs.footerAccent, {
              border: t.border,
              card: t.card,
              muted: t.muted,
            }),
            order: sectionOrder(layers, "footer"),
          }}
        >
          {lv("footer") && prefs.socialPosition === "footer" && socialRow}
          {lv("footer") && prefs.footerTagline &&
            (prefs.footerStyle === "ticker" ? (
              <div className="w-full overflow-hidden">
                <p
                  className="rout-footer-ticker whitespace-nowrap text-[11px] tracking-widest"
                  style={{ color: prefs.footerAccent ?? t.muted }}
                >
                  {`${prefs.footerTagline} \u00b7 `.repeat(6)}
                </p>
              </div>
            ) : (
              <p
                className="text-center text-[11px]"
                style={{ color: prefs.footerAccent ?? t.muted }}
              >
                {prefs.footerTagline}
              </p>
            ))}
          <button
            type="button"
            onClick={() => setWireframe((v) => !v)}
            aria-pressed={wireframe}
            title={tx("profile.designMode")}
            className="font-mono text-[10px] tracking-widest opacity-40 transition-opacity hover:opacity-90"
            style={{ color: t.muted }}
          >
            {wireframe ? tx("profile.inspectOn") : "</>"}
          </button>
          <LocaleDropdown />
          {showWatermark && (
            <a
              href="/about?ref=watermark"
              className="text-[11px] uppercase tracking-widest transition-opacity hover:opacity-70"
              style={{ color: t.muted }}
            >
               {tx("profile.poweredBy")} </a>
          )}
        </footer>
      </div>
      {lv("decorations") && layers.decorations.some((d) => d.visible) && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {layers.decorations.filter((d) => d.visible).map((d) => (
            <DecorationShape key={d.id} d={d} />
          ))}
        </div>
      )}
      {wireframe && <WireframeOverlay root={mainRef} />}
    </main>
    </>
  );
}

export function ProfileMissing({ username, free }: { username: string; free?: boolean }) {
  const { t: tx } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-6 text-center">
      <h1 className="font-display text-2xl">@{username}  {tx("profile.availableSuffix")} </h1>
      <p className="text-sm text-muted-foreground">
         {tx("profile.unclaimed")} {free ? tx("profile.communityNamespace") : tx("profile.orVerified")}  {tx("profile.yet")} </p>
      <a href="/auth?mode=signup" className="mt-2 text-sm font-medium underline">
         {tx("profile.claimHandle")} </a>
    </div>
  );
}

/**
 * Shown when the database lookup itself failed. Never conflate this with an
 * unclaimed handle: telling a member their own profile is "available" because
 * a query timed out is worse than showing an honest error.
 */
export function ProfileLookupError({
  username,
  onRetry,
}: {
  username: string;
  onRetry?: () => void;
}) {
  const { t: tx } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-6 text-center">
      <h1 className="font-display text-2xl">We couldn&apos;t load @{username}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
         {tx("profile.lookupFailed")} </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-sm font-medium underline underline-offset-4"
        >
           {tx("profile.tryAgain")} </button>
      )}
    </div>
  );
}

/** One free-placed decoration (emoji or simple shape) on top of the page. */
export function DecorationShape({ d }: { d: Decoration }) {
  const pos = {
    left: `${d.x}%`,
    top: `${d.y}%`,
    width: d.size,
    height: d.size,
    opacity: d.opacity / 100,
    transform: `translate(-50%, -50%) rotate(${d.rotation}deg)`,
  } as const;
  if (d.kind === "emoji")
    return (
      <span className="absolute flex items-center justify-center leading-none" style={{ ...pos, fontSize: d.size * 0.85 }}>
        {d.emoji}
      </span>
    );
  const paths: Record<string, string> = {
    star: "M50 4l13 31 33 3-25 22 8 33-29-18-29 18 8-33L4 38l33-3z",
    blob: "M52 6c20 2 40 18 42 40s-14 46-40 48S6 80 6 54 32 4 52 6z",
  };
  if (d.kind === "circle" || d.kind === "square")
    return <span className={`absolute ${d.kind === "circle" ? "rounded-full" : "rounded-md"}`} style={{ ...pos, background: d.color }} />;
  return (
    <svg className="absolute" style={pos} viewBox="0 0 100 100">
      <path d={paths[d.kind]} fill={d.color} />
    </svg>
  );
}

/** Status bubble; a 🎧 mark joins in automatically while Spotify plays. */
function ProfileStatus({ handle, prefs, background }: {
  handle: string | null;
  background: string;
  prefs: { statusLine?: string | null; statusBubblePosition: Parameters<typeof StatusBubble>[0]["position"]; statusBubbleStyle: Parameters<typeof StatusBubble>[0]["bubbleStyle"]; statusBubbleBg: string | null; statusBubbleFont: Parameters<typeof StatusBubble>[0]["font"] };
}) {
  const { t: tx } = useTranslation();
  const np = useNowPlaying(handle);
  const playing = Boolean(np.data?.playing);
  if (!prefs.statusLine && !playing) return null;
  return (
    <StatusBubble
      text={prefs.statusLine ?? ""}
      position={prefs.statusBubblePosition}
      bubbleStyle={prefs.statusBubbleStyle}
      bg={prefs.statusBubbleBg ?? background}
      font={prefs.statusBubbleFont}
      extra={playing ? (
        <span className="ml-1 inline-flex" role="img" aria-label={tx("profile.listeningMusic")} title={`${np.data?.title ?? ""} — ${np.data?.artist ?? ""}`}>🎧</span>
      ) : undefined}
    />
  );
}

/** A block that renders as an ordinary outbound link (bar or icon). */
function isPlainLinkBlock(b: ProfileBlock) {
  return isPlainLinkKind(b.kind) && !isBookingUrl(blockHref(b)) && /^(https?:|mailto:|tel:)/.test(blockHref(b));
}
