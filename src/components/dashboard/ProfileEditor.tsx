import { SpatialChoice } from "@/components/ui/spatial-choice";
import { StudioToggleCard } from "@/components/studio/StudioToggleCard";
import { useI18n } from "@/lib/i18n";
import { FeedbackPanel } from "@/components/studio/FeedbackPanel";
import { FediverseProfileField } from "@/components/dashboard/FediverseProfileField";
import { EventsPanel } from "@/components/studio/EventsPanel";
import { isProfileSectionKind, PROFILE_SECTION_LABELS } from "@/lib/profile-section-blocks";
import { integrationById } from "@/lib/integrations-catalog";
import { ProfileWidgetsAccordion } from "@/components/studio/ProfileWidgetsAccordion";
import { ensureStudioWidget } from "@/lib/studio-widget-rules";
import { QaPageDesign } from "@/components/studio/QaPageDesign";
import { StudioSectionIcon } from "@/components/studio/StudioSectionIcon";
import { getMyTipSetup } from "@/lib/tip-page.functions";
import {
  getWorkspaceStudioProfile,
  publishWorkspaceProfile,
  discardWorkspaceStudioDraft,
} from "@/lib/workspace-studio.functions";
import { QrCode } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SocialPlatformIcon } from "@/lib/social-icons";
import { ProfileBasicInfoAccordion } from "@/components/studio/ProfileBasicInfoAccordion";
import { ProfileHeaderPreview } from "@/components/dashboard/editor/ProfileHeaderPreview";
import { ProfileContentAccordion } from "@/components/studio/ProfileContentAccordion";
import { ManualInvoicePanel } from "@/components/dashboard/ManualInvoicePanel";
import { BillingHistoryPanel } from "@/components/dashboard/BillingHistoryPanel";
import { ProfileThemePicker } from "@/components/dashboard/editor/ProfileThemePicker";
import { TABS, RANGE_OPTIONS } from "@/lib/profile-editor-utils";
import type { StudioTab } from "@/types/profile-editor";
import {
  BarChart3,
  Check,
  Eye,
  Folder,
  Globe,
  Link2,
  Loader2,
  Lock,
  Palette,
  Pencil,
  Search,
  Settings,
  Star,
  Upload,
  X,
} from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Input } from "@/components/ui/input";
import { InfoHint } from "@/components/InfoHint";
import { VerifiedBadgeCard } from "@/components/dashboard/VerifiedBadgeCard";
import { SocialSharingCard } from "@/components/dashboard/SocialSharingCard";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileUploadInput } from "@/components/FileUploadInput";

import { useAuth } from "@/hooks/useAuth";
import { useEditorHistory } from "@/hooks/useEditorHistory";
import { Undo2, Redo2, Trash2, Save, CloudOff } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PopoverClose } from "@radix-ui/react-popover";
import { useUrlStyle } from "@/hooks/useUrlStyle";
import { useIdentitySpace } from "@/hooks/useIdentitySpace";
import { resolveLiveProfile } from "@/lib/live-profile";
import type { AliasProfileDTO } from "@/lib/alias-profile.functions";
import type { StudioProfileDTO } from "@/lib/studio-profile.functions";
import { VisitorPanel } from "@/components/dashboard/VisitorPanel";

import { effectiveUrlStyle, styledProfilePath, type UrlStyle } from "@/lib/profile-url";
import {
  BADGE_NAME_FORMATS,
  BADGE_TYPES,
  BADGE_BACKDROPS,
  DEFAULT_DISPLAY_PREFS,
  formatBadgeName,
  parseDisplayPrefs,
  type ProfileDisplayPrefs,
} from "@/lib/profile-display";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BLOCK_CATEGORIES,
  BLOCK_KINDS,
  BLOCK_TABS,
  handleRuleHint,
  HANDLE_MIN_LENGTH,
  handleIssue,
  isValidHandle,
  isReservedHandle,
  newBlockId,
  normalizeHandle,
  resolveLinkMode,
  type ProfileBlock,
  type ProfileRecord,
} from "@/lib/profile";
import { normalizeDesignLayers } from "@/lib/design-layers";
import { cityFromBadge } from "@/lib/ambient-weather";
import { ConversionCoachFab } from "@/components/studio/ConversionCoachFab";
import { ShareInspector } from "@/components/studio/ShareInspector";
import { RoutCardLauncher } from "@/components/wallet/RoutCardLauncher";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { strictHandleIssue, MSG_ALIAS_DIGITS, ALIAS_DIGITS_HINT } from "@/lib/handle-validation";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { HandleErrorBanner } from "@/components/HandleValidationMessage";
import { VerifiedHandleBuilder } from "@/components/settings/VerifiedHandleBuilder";
import { ProfileFavoritesAccordion } from "@/components/studio/ProfileFavoritesAccordion";
import { MAX_FAVORITES } from "@/lib/favorites";
import { ProfileView } from "@/components/profile/ProfileView";
import { LayerStudioAccordion } from "@/components/studio/LayerStudioAccordion";
import { TipPagePanel } from "@/components/dashboard/TipPagePanel";
import { ExtraPagesPanel } from "@/components/dashboard/ExtraPagesPanel";
import {
  checkStudioHandle,
  getStudioAnalytics,
  getStudioProfile,
  publishStudioProfile,
  discardStudioDraft,
} from "@/lib/studio-profile.functions";
import { updateProfileLinks, updateProfileMeta, updateProfileTheme } from "@/lib/profile-draft.functions";
import { diffStudioSnapshot, hasPatches, type StudioSnapshot } from "@/lib/profile-draft-patch";
import { createDraftOperationLock } from "@/lib/profile-draft-state";
import {
  checkAliasHandle,
  discardAliasDraft,
  getAliasProfile,
  publishAliasProfile,
} from "@/lib/alias-profile.functions";
import { SubdomainPanel } from "@/components/dashboard/SubdomainPanel";
import { WorkspaceDomainPanel } from "@/components/dashboard/WorkspaceDomainPanel";
import { WorkspaceAddressCard } from "@/components/workspace/WorkspaceAddressCard";
import { workspacePublicPath } from "@/lib/workspace-rules";
import { EmailForwardingPanel } from "@/components/dashboard/EmailForwardingPanel";
import { EmailAliasDomains } from "@/components/dashboard/EmailAliasDomains";
import { withAuthTimeout, authFailureMessage } from "@/lib/auth-timeout";
import { oauthAvatarOf } from "@/lib/oauth-avatar";
import { BlueskyWizard } from "@/components/dashboard/BlueskyWizard";
import { SocialIdentityVerify } from "@/components/settings/SocialIdentityVerify";
import { WorkspaceSocialPanel } from "@/components/workspace/WorkspaceSocialPanel";
import { WorkspaceBlueskyPanel } from "@/components/workspace/WorkspaceBlueskyPanel";
import { LiveStatusAccordion } from "@/components/studio/LiveStatusAccordion";
import { ShareMenu } from "@/components/profile/ShareMenu";
import { DesignTemplatesPanel } from "@/components/settings/DesignTemplatesPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SaveErrorDialog } from "@/components/dashboard/SaveErrorDialog";
import { classifySaveError, type SaveErrorInfo } from "@/lib/save-errors";
import { draftFingerprint, isUnreachableSaveError, localDraftOffer, saveIndicator, studioDraftKey } from "@/lib/local-first/studio-draft-rules";
import { deleteStudioDraft, getStudioDraft, putStudioDraft } from "@/lib/local-first/studio-draft-store";

export type ProfileVariant = "verified" | "alias" | "workspace";

/** Workspace canvas facts from getWorkspaceStudioProfile. */
type WorkspaceCanvas = { workspaceId: string; name: string; slug: string; role: string; canEdit: boolean; proPlan: boolean };

/**
 * ROUT Studio — the creator workspace for the public Profile Hub.
 * Four fixed tabs (links, design, analytics, settings) with a live mobile
 * preview alongside, fully decoupled from the QR generator.
 */
export function ProfileEditor({ variant = "verified", pageMode = "profile", onPagesChange, workspaceSlug, initialGrid = false }: { variant?: ProfileVariant; pageMode?: "profile" | "tip" | "qa"; onPagesChange?: (pages: { tipEnabled: boolean; qaEnabled: boolean; handle: string }) => void; workspaceSlug?: string; initialGrid?: boolean } = {}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { style: rawUrlStyle, save: saveUrlStylePref } = useUrlStyle();

  // Het aliasprofiel (`/u/<handle>`) en het rootprofiel zijn aparte records met
  // eigen handle, thema en blokken; alleen de RPC-laag verschilt. Een workspace
  // (`/w/<slug>`) is een derde canvas met exact dezelfde Studio.
  const alias = variant === "alias";
  const isWorkspace = variant === "workspace";
  const [wsCanvas, setWsCanvas] = useState<WorkspaceCanvas | null>(null);
  /** Geclaimd bedrijfsdomein van de workspace (rout.be/<domein>) + DNS-status. */
  const [wsDomain, setWsDomain] = useState<{ name: string; verified: boolean } | null>(null);
  const loadPersonal = useServerFn(alias ? getAliasProfile : getStudioProfile);
  const loadWorkspace = useServerFn(getWorkspaceStudioProfile);
  const loadProfileEditor = useCallback(
    (): Promise<unknown> => (isWorkspace ? loadWorkspace({ data: { workspaceSlug: workspaceSlug ?? "" } }) : loadPersonal()),
    [isWorkspace, workspaceSlug, loadWorkspace, loadPersonal],
  );
  const checkHandle = useServerFn(alias ? checkAliasHandle : checkStudioHandle);
  // Atomic mutations: each section saves on its own, bound to this canvas.
  const space = isWorkspace ? "workspace" : alias ? "alias" : "verified";
  const canvas = isWorkspace
    ? ({ space: "workspace", workspaceId: wsCanvas?.workspaceId } as const)
    : ({ space: alias ? "alias" : "verified" } as const);
  const saveMeta = useServerFn(updateProfileMeta);
  const saveTheme = useServerFn(updateProfileTheme);
  const saveLinks = useServerFn(updateProfileLinks);
  /** Last state the server confirmed; the next save sends only what differs. */
  const savedSnapshot = useRef<StudioSnapshot | null>(null);
  const operationLock = useRef(createDraftOperationLock());
  const latestSnapshot = useRef<StudioSnapshot | null>(null);
  const publishPersonal = useServerFn(alias ? publishAliasProfile : publishStudioProfile);
  const discardPersonal = useServerFn(alias ? discardAliasDraft : discardStudioDraft);
  const publishWorkspace = useServerFn(publishWorkspaceProfile);
  const discardWorkspace = useServerFn(discardWorkspaceStudioDraft);
  const publishProfile = (args: { data: { expectedRevision: number } }) =>
    isWorkspace
      ? publishWorkspace({ data: { workspaceId: wsCanvas?.workspaceId ?? "", ...args.data } })
      : publishPersonal(args);
  const discardDraft = (args: { data: { expectedRevision: number } }) =>
    isWorkspace
      ? discardWorkspace({ data: { workspaceId: wsCanvas?.workspaceId ?? "", ...args.data } })
      : discardPersonal(args);
  const loadAnalytics = useServerFn(getStudioAnalytics);
  const [tab, setTab] = useState<StudioTab>("links");
  // Deep link (?tab=identity) from workspace Settings straight to a tab.
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("tab");
    if (want && TABS.some((t) => t.id === want)) setTab(want as StudioTab);
  }, []);
  /** Studio-modus: het profiel zelf of de steunpagina (rout.be/<handle>/tip). */
  const editMode = pageMode;
  const [tipEnabled, setTipEnabled] = useState(false);
  const loadTipSetup = useServerFn(getMyTipSetup);
  // Welke accordion open staat op het tabblad "Settings & verified" — de
  // potlood-knop in de kopbalk stuurt hier rechtstreeks op.
  const [settingsSection, setSettingsSection] = useState<string | undefined>(undefined);
  const handleInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<SaveErrorInfo | null>(null);
  const [errorOpen, setErrorOpen] = useState(false);
  const conflictRebases = useRef(0);
  const [retryIn, setRetryIn] = useState(0);
  const [draftRevision, setDraftRevision] = useState(0);
  const [publishedRevision, setPublishedRevision] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const editRev = useRef(0);
  const failCount = useRef(0);
  const queryClient = useQueryClient();
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [claimed, setClaimed] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [tagline, setTagline] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [theme, setTheme] = useState("noir");
  const [cardStyle, setCardStyle] = useState("bordered");
  const [prefs, setPrefs] = useState<ProfileDisplayPrefs>(DEFAULT_DISPLAY_PREFS);
  const setPref = <K extends keyof ProfileDisplayPrefs>(key: K, value: ProfileDisplayPrefs[K]) =>
    setPrefs((p) => ({ ...p, [key]: value }));
  const [blocks, setBlocks] = useState<ProfileBlock[]>([]);
  const gridEntryOpened = useRef(false);
  useEffect(() => {
    if (!initialGrid || loading || loadError || gridEntryOpened.current) return;
    gridEntryOpened.current = true;
    const existing = blocks.find((block) => block.kind === "social_grid");
    const id = existing?.id ?? newBlockId();
    if (!existing) setBlocks((list) => [...list, { id, kind: "social_grid", label: t("studio.grid.defaultTitle"), value: JSON.stringify({ title: "", items: [] }) }]);
    setOpenBlock(id);
  }, [initialGrid, loading, loadError, blocks, t]);
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    if (alias || !verified) return;
    let alive = true;
    void loadTipSetup().then((setup) => { if (alive) setTipEnabled(setup.settings?.enabled === true); }).catch(() => undefined);
    return () => { alive = false; };
  }, [alias, verified, loadTipSetup]);
  // Rootclaim-gegevens: nodig om "Bekijk live profiel" uit één bron te halen.
  const [subdomainAlias, setSubdomainAlias] = useState<string | null>(null);
  /** Handle die eigenlijk een via DNS geclaimde domeinnaam is (rout.be/example.be). */
  const claimedDomainHandle = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(subdomainAlias ?? "")
    ? subdomainAlias
    : null;
  const [rootStatus, setRootStatus] = useState<string | null>(null);
  /** Exclusieve badges: enkel zichtbaar als keuze na goedkeuring door een admin. */
  const [approvedTiers, setApprovedTiers] = useState({ business: false, influencer: false });
  const [aliasHandle, setAliasHandle] = useState<string | null>(null);
  /** `profiles.username` van hetzelfde account (geverifieerde rootnaam). */
  const [rootUsername, setRootUsername] = useState<string | null>(null);
  const { space: identitySpace, select: selectIdentitySpace } = useIdentitySpace(verified);

  const [legalName, setLegalName] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** Standaard staat "Soeverein & Fediverse" voor: soevereine tools eerst. */
  const [cat, setCat] = useState<string>("featured");
  /** Actieve curated tab in de t("studio.editor.add")-drawer (`null` = klassieke categorieën). */
  const [blockTab, setBlockTab] = useState<string | null>(null);
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [stats, setStats] = useState<{ qrs: number; scans: number } | null>(null);
  const [range, setRange] = useState<(typeof RANGE_OPTIONS)[number]["id"]>("30d");
  const [series, setSeries] = useState<{ date: string; scans: number }[] | null>(null);
  const [availability, setAvailability] = useState<"idle" | "checking" | "available" | "taken">(
    "idle",
  );
  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        console.info("[studio:profile-load:start]", { attempt: loadAttempt });
        const started = Date.now();
        const data = await withAuthTimeout(
          loadProfileEditor() as Promise<
            | (AliasProfileDTO & Partial<StudioProfileDTO>)
            | (StudioProfileDTO & Partial<AliasProfileDTO>)
            | null
          >,
          "studio:getStudioProfile",
          8_000,
        );
        if (!active) return;
        console.info(`[studio:profile-load:done] ${Date.now() - started}ms found=${Boolean(data)}`);
        if (data) {
          setHandle(data.username ?? "");
          setClaimed(data.username ?? null);
          const rootData = data as Partial<{
            subdomainAlias: string | null;
            rootStatus: string | null;
            aliasHandle: string | null;
            ownerVerified: boolean;
            rootUsername: string | null;
          }>;
          // Verificatie hangt aan het account, niet aan het profiel dat je
          // bewerkt: bij het aliasprofiel komt die vlag uit `ownerVerified`.
          setVerified(
            alias
              ? Boolean(rootData.ownerVerified)
              : Boolean(data.verified) && data.status === "active",
          );
          setRootUsername(alias ? (rootData.rootUsername ?? null) : (data.username ?? null));
          setSubdomainAlias(rootData.subdomainAlias ?? null);
          setRootStatus(rootData.rootStatus ?? null);
          setApprovedTiers({
            business: Boolean((data as { isBusiness?: boolean }).isBusiness),
            influencer: Boolean((data as { isInfluencer?: boolean }).isInfluencer),
          });
          setAliasHandle(alias ? (data.username ?? null) : (rootData.aliasHandle ?? null));
          setLegalName(data.verifiedLegalName || null);
          setDisplayName(data.displayName ?? "");
          setTagline(data.tagline ?? "");
          setAvatarUrl(data.avatarUrl ?? oauthAvatarOf(user) ?? "");
          setFaviconUrl(data.faviconUrl ?? "");
          setTheme(data.theme ?? "noir");
          setCardStyle(data.cardStyle ?? "bordered");
          setBlocks(Array.isArray(data.blocks) ? (data.blocks as unknown as ProfileBlock[]) : []);
          setDraftRevision(data.draftRevision ?? 0);
          setPublishedRevision(data.publishedRevision ?? 0);
          if (isWorkspace) {
            // Het workspace-canvas: zonder deze feiten zou elke sectie-save of
            // publicatie een leeg workspaceId sturen.
            const ws = data as Partial<{
              workspaceId: string; workspaceName: string; workspaceSlug: string;
              role: string; canEdit: boolean; proPlan: boolean;
              domain: string | null; domainVerified: boolean;
            }>;
            setWsCanvas({
              workspaceId: ws.workspaceId ?? "",
              name: ws.workspaceName ?? "",
              slug: ws.workspaceSlug ?? "",
              role: ws.role ?? "member",
              canEdit: Boolean(ws.canEdit),
              proPlan: Boolean(ws.proPlan),
            });
            setWsDomain(ws.domain ? { name: ws.domain, verified: Boolean(ws.domainVerified) } : null);
          }
        } else if (alias) {
          // The Privacy Alias starts blank: never seed it with the account's
          // real name, email or avatar — that would link it to the member.
          setHandle("");
          setDisplayName("");
          setAvatarUrl("");
        } else {
          const wanted = (user.user_metadata?.desired_handle as string | undefined) ?? "";
          setHandle(normalizeHandle(wanted || user.email?.split("@")[0] || ""));
          setDisplayName((user.user_metadata?.full_name as string | undefined) ?? "");
          setAvatarUrl(oauthAvatarOf(user) ?? "");
        }
        // Weergavevoorkeuren komen uit de database; lokale legacy-waarden
        // dienen alleen nog als terugval voor wie nog niet opnieuw opsloeg.
        let loadedPrefs = parseDisplayPrefs(data?.displayPrefs ?? null);
        if (!alias && (!data?.displayPrefs || Object.keys(data.displayPrefs).length === 0)) {
          try {
            const raw = localStorage.getItem(`rout_studio_extra_${user.id}`);
            if (raw) loadedPrefs = parseDisplayPrefs({ ...loadedPrefs, ...JSON.parse(raw) });
          } catch {
            /* ignore */
          }
        }
        setPrefs(loadedPrefs);
        setLoadError(null);
      } catch (error) {
        if (!active) return;
        console.error("[studio:profile-load:failed]", {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : typeof error,
          status: (error as { status?: number } | null)?.status ?? null,
          body: (error as { body?: unknown } | null)?.body ?? null,
          raw: error,
        });

        setLoadError(
          authFailureMessage(error, t("studio.editor.loadFailed")),
        );
      } finally {
        // Never leave the studio spinning: the loader stops on success and failure.
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, loadProfileEditor, loadAttempt]);

  // Privacy-first counters: only aggregated counts, no visitor profiles (Neon).
  useEffect(() => {
    if (!user || tab !== "analytics") return;
    let active = true;
    const opt = RANGE_OPTIONS.find((r) => r.id === range);
    (async () => {
      try {
        const data = await loadAnalytics({ data: { days: opt?.days ?? null } });
        if (!active) return;
        setStats({ qrs: data.qrs, scans: data.scans });
        setSeries(data.series);
      } catch (error) {
        if (!active) return;
        console.error("[studio:analytics:failed]", error);
        setStats({ qrs: 0, scans: 0 });
        setSeries([]);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tab, range]);

  /** Canonical public host — always rout.be, even in preview/dev. */
  const host = "rout.be";
  const normalized = normalizeHandle(handle);
  const reserved = isReservedHandle(normalized);
  const handleCtx = {
    // Het aliasprofiel blijft altijd de gratis naamruimte, ook bij een
    // geverifieerd account: de aliasregels (cijfers) gelden daar.
    tier: (!alias && verified ? "verified" : "free") as "verified" | "free",
    // Geverifieerde handles volgen altijd de naamstructuur — ook in privacy-modus,
    // want het blauwe vinkje hangt aan die wettelijke naam.
    legalName,
    identityMode: prefs.identityMode,
  };
  // Strikte platformregels (tekens, lengte, systeemwoorden, alias-cijfers) —
  // deze blokkeren het opslaan volledig.
  const strictIssue = strictHandleIssue(handle, { alias });
  const handleProblem = normalized ? handleIssue(normalized, handleCtx) : null;
  // Een workspace-username is de vaste slug (beheerd op Identiteit), dus de
  // persoonlijke handle-regels mogen het opslaan daar nooit blokkeren — anders
  // bleef "Wijzigingen opslaan…" eindeloos draaien.
  const handleOk = isWorkspace || (isValidHandle(normalized) && !reserved && !handleProblem && !strictIssue);
  /** Een reeds opgeslagen handle die niet meer aan de richtlijnen voldoet. */
  const storedHandleInvalid = claimed ? strictHandleIssue(claimed, { alias }) : null;
  // Volg de actieve identiteitsruimte; schone root-URLs blijven Pro-only.
  const urlStyle = alias
    ? "u"
    : effectiveUrlStyle(
        identitySpace === "verified"
          ? "clean"
          : rawUrlStyle === "clean" || rawUrlStyle === "clean_at"
            ? "u"
            : rawUrlStyle,
        verified,
      );
  /**
   * Eén bron van waarheid voor de live URL: de actieve rootnaam wanneer de
   * claim actief is, anders altijd `/u/<alias>`. Nooit uit lokale state.
   */
  const live = resolveLiveProfile({
    username: alias ? rootUsername : claimed,
    subdomainAlias,
    rootStatus,
    aliasHandle: alias ? claimed : aliasHandle,
    verified,
    // De URL-balk hoort bij het profiel dat je nú bewerkt.
    prefer: alias ? "alias" : "root",
  });
  // Workspace-URL: het geverifieerde bedrijfsdomein (rout.be/<domein>) wint,
  // anders de vaste workspace-slug. Één bron van waarheid, nooit lokale state.
  const publicPath = isWorkspace
    ? workspacePublicPath(wsCanvas?.slug ?? workspaceSlug ?? "", wsDomain)
    : (live.path ?? styledProfilePath(claimed ?? "", urlStyle));
  useEffect(() => { onPagesChange?.({ tipEnabled: !alias && verified && tipEnabled, qaEnabled: prefs.questionsEnabled && prefs.qaPage, handle: normalized }); }, [alias, verified, tipEnabled, prefs.questionsEnabled, prefs.qaPage, normalized, onPagesChange]);

  // De "Domains & Bluesky"-tab is verified-only voor personen; een workspace
  // krijgt hem altijd: domeinclaim (rout.be/<domein>) is háár verificatie.
  const visibleTabs = useMemo(() => TABS.filter((t) => !t.verifiedOnly || verified || isWorkspace || t.id === "identity"), [verified, isWorkspace]);
  // Losing verification (or loading it late) must never leave the studio on a
  // tab that is no longer rendered — that would show an empty pane.
  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === tab)) setTab("links");
  }, [visibleTabs, tab]);

  // Debounced real-time handle availability check against the profiles table.
  // Een workspace-username ís de slug (vast); er valt niets te checken.
  useEffect(() => {
    if (isWorkspace || !normalized || !handleOk) {
      setAvailability("idle");
      return;
    }
    if (normalized === claimed) {
      setAvailability("available");
      return;
    }
    setAvailability("checking");
    const id = setTimeout(async () => {
      const data = await checkHandle({ data: { handle: normalized } });
      setAvailability(data.ok ? "available" : "taken");
    }, 400);
    return () => clearTimeout(id);
  }, [normalized, handleOk, claimed, user, checkHandle]);

  const draft: ProfileRecord = useMemo(
    () => ({
      id: user?.id ?? "draft",
      username: normalized || "handle",
      display_name: displayName,
      tagline,
      avatar_url: avatarUrl || null,
      favicon_url: faviconUrl || null,
      theme,
      card_style: cardStyle,
      blocks,
      verified,
      human_linked: verified,
      status: verified ? "active" : "pending",
      verified_legal_name: legalName,
      display_prefs: prefs,
    }),
    [
      user,
      normalized,
      displayName,
      tagline,
      avatarUrl,
      faviconUrl,
      theme,
      cardStyle,
      blocks,
      verified,
      legalName,
      prefs,
    ],
  );

  /**
   * De preview moet exact dezelfde namespace-regels volgen als de publieke
   * route: `/u/<handle>` rendert altijd `free` (mens-badge + alias-URL), de
   * schone `/<handle>` alleen voor geverifieerde leden.
   */
  const previewFree = alias || !verified;

  /**
   * Ongedaan maken / opnieuw doen (Ctrl+Z, Ctrl+Y of ⇧Ctrl+Z, en de terug/verder
   * knoppen in de kopbalk) over alles wat je in de studio bewerkt.
   */
  const historySnapshot = useMemo(
    () => ({
      handle,
      displayName,
      tagline,
      avatarUrl,
      faviconUrl,
      theme,
      cardStyle,
      prefs,
      blocks,
    }),
    [handle, displayName, tagline, avatarUrl, faviconUrl, theme, cardStyle, prefs, blocks],
  );
  const applySnapshot = useCallback((s: typeof historySnapshot) => {
    setHandle(s.handle);
    setDisplayName(s.displayName);
    setTagline(s.tagline);
    setAvatarUrl(s.avatarUrl);
    setFaviconUrl(s.faviconUrl);
    setTheme(s.theme);
    setCardStyle(s.cardStyle);
    setPrefs(s.prefs);
    setBlocks(s.blocks);
  }, []);
  const { undo, redo, canUndo, canRedo } = useEditorHistory({
    snapshot: historySnapshot,
    apply: applySnapshot,
    enabled: !loading,
  });

  /**
   * Debounced copy of the draft (max. 1 preview re-render per 150ms) so typing
   * stays at 60 FPS on phones instead of re-rendering the whole profile view
   * on every keystroke.
   */
  const [previewDraft, setPreviewDraft] = useState<ProfileRecord>(draft);
  useEffect(() => {
    const id = setTimeout(() => setPreviewDraft(draft), 150);
    return () => clearTimeout(id);
  }, [draft]);

  // Autosave: flag changes and save silently after 1.2s of rest.
  const firstDraft = useRef(true);
  useEffect(() => {
    if (loading) return;
    if (firstDraft.current) {
      firstDraft.current = false;
      savedSnapshot.current = currentSnapshot();
      return;
    }
    const changed = hasPatches(diffStudioSnapshot(savedSnapshot.current, currentSnapshot()));
    if (changed) editRev.current += 1;
    setDirty(changed);
  }, [draft, loading]);

  // A newly added or removed component (video, link, widget) is saved without the usual pause.
  const flushSoon = useRef(false);
  const blockCount = useRef<number | null>(null);
  useEffect(() => {
    if (blockCount.current !== null && blockCount.current !== blocks.length) flushSoon.current = true;
    blockCount.current = blocks.length;
  }, [blocks.length]);

  // Opslaan één tegelijk; bij fout opnieuw proberen met oplopende pauze.
  useEffect(() => {
    if (!dirty || saving || discarding || publishing || !handleOk) return;
    const wait = saveError ? Math.min(30000, 2000 * 2 ** (failCount.current - 1)) : flushSoon.current ? 0 : 500;
    const id = setTimeout(() => { flushSoon.current = false; void save(true); }, wait);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, draft, handleOk, saving, discarding, publishing, saveError, retryIn]);

  // Direct opslaan bij tab-/paginawissel, verbergen van de pagina of verlaten van de Studio,
  // zodat een net toegevoegde video of link nooit verloren gaat.
  const flushRef = useRef<() => void>(() => {});
  flushRef.current = () => {
    if (dirty && !saving && !discarding && !publishing && handleOk) void save(true);
  };
  useEffect(() => { flushRef.current(); }, [tab, pageMode]);
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flushRef.current(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flushRef.current();
    };
  }, []);

  // Waarschuwen bij verlaten met niet-opgeslagen wijzigingen.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  // On-device copy of unsent edits: survives a lost connection or a closed tab and
  // is offered back on the next visit. It never counts as "saved at ROUT".
  const draftKey = user ? studioDraftKey(user.id, space, isWorkspace ? wsCanvas?.workspaceId : null) : null;
  const [localSavedRev, setLocalSavedRev] = useState(0);
  const [localOffer, setLocalOffer] = useState<{ savedAt: number; value: typeof historySnapshot } | null>(null);
  const localChecked = useRef<string | null>(null);
  // Local writes run one after another, so an older revision can never overwrite a newer one,
  // and every server save awaits the committed local copy of the revision it sends.
  const localWrites = useRef<Promise<boolean>>(Promise.resolve(true));
  const persistLocal = (rev: number, value: typeof historySnapshot): Promise<boolean> => {
    if (!draftKey) return Promise.resolve(false);
    const key = draftKey;
    const fingerprint = draftFingerprint(value);
    const write = localWrites.current
      .then(() => putStudioDraft(key, value, fingerprint), () => putStudioDraft(key, value, fingerprint))
      .catch(() => false);
    localWrites.current = write;
    return write.then((ok) => {
      if (ok) setLocalSavedRev((r) => Math.max(r, rev));
      return ok;
    });
  };
  useEffect(() => {
    if (loading || !draftKey || localChecked.current === draftKey) return;
    localChecked.current = draftKey;
    const serverPrint = draftFingerprint(historySnapshot);
    void getStudioDraft<typeof historySnapshot>(draftKey).then((local) => {
      const offer = localDraftOffer(local, serverPrint, Date.now());
      if (offer === "restore" && local) setLocalOffer({ savedAt: local.savedAt, value: local.value });
      else if (offer === "discard") void deleteStudioDraft(draftKey);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, draftKey]);
  useEffect(() => {
    if (loading || !draftKey || !dirty || localOffer) return;
    const rev = editRev.current;
    const value = historySnapshot;
    const id = setTimeout(() => {
      void persistLocal(rev, value);
    }, 250);
    return () => clearTimeout(id);
  }, [historySnapshot, dirty, loading, draftKey, localOffer]);
  useEffect(() => {
    if (!draftKey || dirty || saveError || !savedAt || localOffer) return;
    void deleteStudioDraft(draftKey);
  }, [savedAt, dirty, saveError, draftKey, localOffer]);
  // Back online: try again right away instead of waiting for the next back-off step.
  useEffect(() => {
    const onOnline = () => { failCount.current = 0; flushRef.current(); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);
  const restoreLocalDraft = () => {
    if (!localOffer) return;
    applySnapshot(localOffer.value);
    setLocalOffer(null);
  };
  const dropLocalDraft = () => {
    if (draftKey) void deleteStudioDraft(draftKey);
    setLocalOffer(null);
  };

  const currentSnapshot = (): StudioSnapshot => ({
    username: normalized,
    displayName: displayName.trim() || null,
    tagline: tagline.trim() || null,
    avatarUrl: avatarUrl.trim() || null,
    faviconUrl: faviconUrl.trim() || null,
    theme,
    cardStyle,
    prefs: prefs as unknown as Record<string, unknown>,
    blocks: blocks as unknown[],
  });
  latestSnapshot.current = currentSnapshot();

  const save = async (silent = false) => {
    if (!user) return;
    if (!handleOk) {
      if (silent) return;
      return toast.error(handleProblem ?? `Choose a valid handle — ${handleRuleHint(handleCtx)}.`);
    }
    if (!operationLock.current.acquire("save")) return;
    setSaving(true);
    try {
    const rev = editRev.current;
    const localValue = historySnapshot;
    const next = currentSnapshot();
    const patches = diffStudioSnapshot(savedSnapshot.current, next);
    type PatchResult = Awaited<ReturnType<typeof saveMeta>>;
    let results: PatchResult[];
    try {
      // Device copy first: only when this write has committed may the server call start.
      if (!localOffer) await persistLocal(rev, localValue);
      const calls: Promise<PatchResult>[] = [];
      if (patches.meta) calls.push(saveMeta({ data: { ...canvas, ...patches.meta } }));
      if (patches.theme) calls.push(saveTheme({ data: { ...canvas, ...patches.theme } as never }));
      if (patches.links) calls.push(saveLinks({ data: { ...canvas, blocks: patches.links.blocks as never } }));
      results = hasPatches(patches) ? await Promise.all(calls) : [];
    } catch (e) {
      failCount.current += 1;
      // Keep the browser's own message so the detail panel shows what really failed.
      setSaveError(classifySaveError(e));
      setRetryIn((n) => n + 1);
      return;
    }
    const failed = results.find((r) => !r.ok);
    // Sections that succeeded are confirmed even when another one failed.
    const base = savedSnapshot.current;
    const confirmed: StudioSnapshot = base ? { ...base, prefs: { ...base.prefs } } : next;
    const okMeta = results.filter((r) => r.ok).map((r) => r.meta);
    if (base) {
      const okAt = (i: number) => results[i]?.ok === true;
      let i = 0;
      if (patches.meta) { if (okAt(i)) Object.assign(confirmed, { username: next.username, displayName: next.displayName, tagline: next.tagline, avatarUrl: next.avatarUrl, faviconUrl: next.faviconUrl }); i += 1; }
      if (patches.theme) { if (okAt(i)) Object.assign(confirmed, { theme: next.theme, cardStyle: next.cardStyle, prefs: next.prefs }); i += 1; }
      if (patches.links) { if (okAt(i)) confirmed.blocks = next.blocks; }
    }
    if (!failed || base) savedSnapshot.current = failed ? confirmed : next;
    const latest = okMeta.reduce<{ draftRevision: number; publishedRevision: number } | null>(
      (acc, m) => (m && (!acc || m.draftRevision > acc.draftRevision) ? m : acc),
      null,
    );
    if (latest) {
      setDraftRevision(latest.draftRevision);
      setPublishedRevision(latest.publishedRevision);
    }
    if (failed && failed.error) {
      failCount.current += 1;
      setSaveError(failed.error);
      if (silent) return;
      return toast.error(failed.error.detail ?? t("studio.editor.saveFailedEn"));
    }
    setClaimed(normalized);
    failCount.current = 0;
    conflictRebases.current = 0;
    setSaveError(null);
    // Alleen "opgeslagen" als er tijdens het opslaan niets meer veranderde.
    if (editRev.current === rev) setDirty(false);
    setSavedAt(Date.now());
    if (!silent) toast.success(t("studio.editor.saved"));
    } finally {
      operationLock.current.release();
      setSaving(false);
    }
  };

  const publish = async () => {
    if (dirty || saving) {
      toast.info(t("studio.editor.wait"));
      return;
    }
    if (draftRevision === publishedRevision) {
      toast.info(t("studio.editor.noChanges"));
      return;
    }
    if (!operationLock.current.acquire("publish")) return;
    setPublishing(true);
    try {
    const result = await publishProfile({ data: { expectedRevision: draftRevision } }).catch((error) => ({
      ok: false as const,
      meta: null,
      reason: error instanceof Error ? error.message : "publish_failed",
    }));
    if (!result.ok || !result.meta) {
      if (result.reason === "draft_conflict") {
        toast.error(t("studio.editor.conflict"));
      } else {
        toast.error(t("studio.editor.publishFailed"));
      }
      return;
    }
    setPublishedRevision(result.meta.publishedRevision);
    setClaimed(normalized);
    void queryClient.invalidateQueries({ queryKey: ["public-profile", normalized] });
    void router.invalidate();
    toast.success(t("studio.editor.published"));
    } finally {
      operationLock.current.release();
      setPublishing(false);
    }
  };

  const applyPayload = (payload: Record<string, unknown>) => {
    setHandle(String(payload["username"] ?? ""));
    setDisplayName(String(payload["displayName"] ?? ""));
    setTagline(String(payload["tagline"] ?? ""));
    setAvatarUrl(String(payload["avatarUrl"] ?? ""));
    setFaviconUrl(String(payload["faviconUrl"] ?? ""));
    setTheme(String(payload["theme"] ?? "noir"));
    setCardStyle(String(payload["cardStyle"] ?? "bordered"));
    setBlocks(Array.isArray(payload["blocks"]) ? (payload["blocks"] as ProfileBlock[]) : []);
    setPrefs(parseDisplayPrefs(payload["displayPrefs"] ?? null));
  };

  const discard = async () => {
    if (saving || publishing) return;
    if (!operationLock.current.acquire("discard")) return;
    const beforeDiscard = latestSnapshot.current;
    setDiscarding(true);
    try {
    const result = (await discardDraft({ data: { expectedRevision: draftRevision } }).catch((error) => ({
      ok: false as const,
      payload: null,
      meta: null,
      reason: error instanceof Error ? error.message : "discard_failed",
    }))) as {
      ok: boolean;
      payload: Record<string, unknown> | null;
      meta: { draftRevision: number; publishedRevision: number } | null;
      reason: string | null;
    };
    if (!result.ok || !result.payload || !result.meta) {
      toast.error(result.reason === "draft_conflict" ? t("studio.editor.discardConflict") : t("studio.editor.discardFailed"));
      return;
    }
    const editedDuringDiscard = beforeDiscard && latestSnapshot.current
      ? hasPatches(diffStudioSnapshot(beforeDiscard, latestSnapshot.current)) : false;
    savedSnapshot.current = {
      username: String(result.payload["username"] ?? ""),
      displayName: result.payload["displayName"] as string | null,
      tagline: result.payload["tagline"] as string | null,
      avatarUrl: result.payload["avatarUrl"] as string | null,
      faviconUrl: result.payload["faviconUrl"] as string | null,
      theme: String(result.payload["theme"] ?? "noir"),
      cardStyle: String(result.payload["cardStyle"] ?? "bordered"),
      prefs: parseDisplayPrefs(result.payload["displayPrefs"]) as unknown as Record<string, unknown>,
      blocks: Array.isArray(result.payload["blocks"]) ? result.payload["blocks"] : [],
    };
    setDraftRevision(result.meta.draftRevision);
    setPublishedRevision(result.meta.publishedRevision);
    if (!editedDuringDiscard) applyPayload(result.payload);
    setDirty(editedDuringDiscard);
    setSaveError(null);
    if (!editedDuringDiscard) toast.success(t("studio.editor.restored"));
    } finally {
      operationLock.current.release();
      setDiscarding(false);
    }
  };

  const addBlock = (kind: string, value = "") => {
    const label = kind === "social_grid" ? t("studio.grid.defaultTitle") : kind === "feedback" ? t("feedback.title") : isProfileSectionKind(kind)
      ? PROFILE_SECTION_LABELS[kind]
      : kind === "live"
        ? integrationById(value)?.label
        : BLOCK_KINDS.find((k) => k.kind === kind)?.label;
    if (!label) return;
    const existing = isProfileSectionKind(kind)
      ? blocks.find((b) => b.kind === kind)
      : kind === "live" ? blocks.find((b) => b.kind === "live" && b.value === value) : undefined;
    if (existing) {
      setBlocks((list) => list.map((b) => b.id === existing.id ? { ...b, hidden: false } : b));
      setOpenBlock(existing.id);
      return;
    }
    if (kind === "widget:badges") setPref("badgeShowcaseVisible", true);
    const id = newBlockId();
    setBlocks((b) => [...b, { id, kind, label, value }]);
    setOpenBlock(id);
    setDrawer(false);
    // Search term and category are kept for next time.
  };

  /**
   * Plakt de maker een geldige URL in het zoekveld, dan bieden we direct een
   * vooraf ingevuld Smart Link-component aan (fast paste → smart link).
   */
  const pastedUrl = useMemo(() => {
    const q = query.trim();
    if (q.length < 6 || q.includes(" ")) return null;
    const withProto = /^https?:\/\//i.test(q) ? q : `https://${q}`;
    try {
      const u = new URL(withProto);
      if (!u.hostname.includes(".")) return null;
      return u.toString();
    } catch {
      return null;
    }
  }, [query]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Curated tab actief → toon alleen de kinds van die tab als één groep.
    if (blockTab) {
      const tab = BLOCK_TABS.find((t) => t.id === blockTab);
      if (tab) {
        const items = tab.kinds
          .map((kind) => BLOCK_KINDS.find((k) => k.kind === kind))
          .filter((k): k is (typeof BLOCK_KINDS)[number] => Boolean(k))
          .filter((k) => !q || k.label.toLowerCase().includes(q));
        return items.length ? [{ id: tab.id, label: tab.label, items }] : [];
      }
    }
    return BLOCK_CATEGORIES.filter((c) => cat === "all" || cat === c.id)
      .map((c) => ({
        ...c,
        items: BLOCK_KINDS.filter(
          (k) => k.category === c.id && (!q || k.label.toLowerCase().includes(q)),
        ),
      }))
      .filter((c) => c.items.length > 0);
  }, [cat, query, blockTab]);

  // Top clicked components: proportional estimate over total scans, ranked by position
  // until per-block click tracking ships. Purely presentational, no fabricated identities.
  const topClicked = useMemo(() => {
    const visible = blocks.filter((b) => b && !b.hidden && b.value);
    if (!visible.length || !stats?.scans) return [];
    const weights = visible.map((_, i) => visible.length - i);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    return visible
      .map((b, i) => {
        const clicks = Math.round((weights[i] / totalWeight) * stats.scans);
        return { block: b, clicks };
      })
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 6);
  }, [blocks, stats]);
  const maxClicks = topClicked[0]?.clicks || 1;

  if (loadError) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm font-medium">{t("studio.editor.loadTitle")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{loadError}</p>
        <Button variant="outline" onClick={() => setLoadAttempt((n) => n + 1)}>
          {t("studio.editor.retry")}
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /**
   * Snelkoppeling vanuit de kopbalk: spring naar "Settings & verified", open de
   * identiteitsaccordeon en zet de cursor in het juiste handle-veld
   * (`verified_handle` of `alias_handle`, afhankelijk van het actieve profiel).
   */
  const openHandleEditor = () => {
    setTab("settings");
    setSettingsSection("identity_badges");
    window.setTimeout(() => {
      const input = handleInputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
    }, 220);
  };

  const showSaveBar = tab !== "analytics";
  const indicator = saveIndicator({ saving, dirty, failed: Boolean(saveError), unreachable: isUnreachableSaveError(saveError?.code), localSavedRev, editRev: editRev.current, savedAt });

  return (
    <div className={cn("flex flex-1 flex-col space-y-4", showSaveBar && "pb-16 lg:pb-4")}>
      {storedHandleInvalid && (
        <HandleErrorBanner message={t("studio.editor.oldHandle")} />
      )}
      {/* Compacte studiokop: tier-balk en tabs blijven bij het scrollen staan en
          nemen samen nauwelijks hoogte in, zodat de live preview hoger begint. */}
      {/* RIJ 1 — profielstatus & URL-balk */}
      <div className="flex min-w-0 max-w-full items-center gap-3 overflow-hidden acrylic-card p-2 md:justify-between md:p-4">
        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              verified ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            {verified ? "Pro" : "Free"}
          </span>
          <ShareMenu
            url={`https://rout.be${styledProfilePath(claimed ?? normalized, urlStyle)}`}
            handle={claimed ?? ""}
            name={displayName}
            bio={tagline}
            avatarUrl={avatarUrl}
            qrStyle={prefs.qrSettings ?? null}
            showNfc
          />
          <a
            href={publicPath}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate font-mono text-xs font-medium underline-offset-4 hover:underline sm:text-sm"
          >
            {live.label ?? `${host}${styledProfilePath(normalized || "handle", urlStyle)}`}
          </a>
          <Button variant="outline" size="icon"
            type="button"
            onClick={openHandleEditor}
            aria-label={t("studio.editor.editHandle")}
            title={t("studio.editor.editHandle")}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-muted"
          >
            <Pencil
              className="h-3.5 w-3.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-hidden
            />
          </Button>
        </div>
        <div className="flex w-full min-w-0 flex-nowrap items-center gap-1.5 md:w-auto md:shrink-0 md:gap-2">
          <Button variant="outline" size="icon"
            type="button"
            onClick={undo}
            disabled={!canUndo}
            aria-label={t("studio.editor.undo")}
            title={t("studio.editor.undoTitle")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border transition-colors hover:bg-muted disabled:opacity-40"
          >
            <Undo2 className="h-4 w-4" aria-hidden />
          </Button>
          <Button variant="outline" size="icon"
            type="button"
            onClick={redo}
            disabled={!canRedo}
            aria-label={t("studio.editor.redo")}
            title={t("studio.editor.redoTitle")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border transition-colors hover:bg-muted disabled:opacity-40"
          >
            <Redo2 className="h-4 w-4" aria-hidden />
          </Button>
          <Button variant="outline" size="icon"
            type="button"
            onClick={openHandleEditor}
            aria-label={t("studio.editor.editHandle")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border hover:bg-muted md:hidden"
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </Button>
          <ShareMenu
            iconOnly
            className="md:hidden"
            url={`https://rout.be${styledProfilePath(claimed ?? normalized, urlStyle)}`}
            handle={claimed ?? ""}
            name={displayName}
            bio={tagline}
            avatarUrl={avatarUrl}
            qrStyle={prefs.qrSettings ?? null}
            showNfc
          />
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon"
                type="button"
                aria-label="Mijn ontwerpen"
                title="Mijn ontwerpen"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border transition-colors hover:bg-muted"
              >
                <Save className="h-4 w-4" aria-hidden />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Mijn ontwerpen</DialogTitle>
              </DialogHeader>
              <DesignTemplatesPanel compact />
            </DialogContent>
          </Dialog>
          <a
            href={publicPath}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-xs font-medium transition-colors hover:bg-muted md:inline-flex"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden /> <span className="hidden min-[400px]:inline sm:inline">{t("studio.editor.view")}</span><span className="min-[400px]:hidden sm:hidden">{t("studio.editor.viewShort")}</span>
          </a>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon"
                type="button"
                aria-label={t("studio.editor.discard")}
                disabled={discarding || publishing || saving || draftRevision === publishedRevision}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border transition-colors hover:bg-muted disabled:opacity-40 md:hidden"
              >
                {discarding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 space-y-3 p-3">
              <p className="text-sm">{t("studio.editor.discardConfirm")}</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="destructive" className="flex-1" onClick={() => void discard()}>
                  Ja, wis
                </Button>
                <PopoverClose asChild>
                  <Button type="button" size="sm" variant="outline" className="flex-1">Annuleer</Button>
                </PopoverClose>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="hidden md:inline-flex"
            disabled={discarding || publishing || saving || draftRevision === publishedRevision}
            onClick={() => void discard()}
          >
            {discarding ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {t("studio.editor.discard")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="ml-auto md:ml-0"
            data-tour="studio-publish"
            disabled={publishing || discarding || saving || dirty || draftRevision === publishedRevision}
            onClick={() => void publish()}
          >
            {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
            {publishing ? t("studio.editor.publishing") : t("studio.editor.publish")}
          </Button>
        </div>
      </div>

      {editMode === "qa" ? <QaPageDesign prefs={prefs} setPref={setPref} handle={normalized} avatarUrl={avatarUrl} theme={theme} /> : editMode === "tip" && !alias && verified ? (
        <div className="mt-4 grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <div className="min-w-0 space-y-6 lg:col-span-7">
            <TipPagePanel onEnabledChange={setTipEnabled} />
          </div>
          <div className="hidden lg:col-span-5 lg:block">
            <div className="sticky top-32 overflow-hidden rounded-3xl border border-border">
              <iframe title="Voorbeeld steunpagina" src={`/${normalized}/tip`} className="h-[720px] w-full bg-background" />
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* RIJ 2 — hoofdnavigatie van de studio */}
      <SpatialChoice<StudioTab> role="tablist" label="Studio" value={tab} onChange={setTab}
        className="sticky top-14 z-30 w-full flex-nowrap overflow-x-auto"
        options={visibleTabs.map(({ id }) => ({ value: id, title: t(`studio.tab.${id}`), label: <><StudioSectionIcon kind={id === "links" ? "content" : id} className="size-4 text-current" />{t(`studio.tab.${id}`)}</> }))} />

      <div className="mt-6 grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-7">
          {tab === "links" && (
            // Leaving a link title or URL field saves straight away.
            <div onBlurCapture={() => flushRef.current()}>
            <Accordion type="single" collapsible defaultValue={initialGrid ? "components_list" : undefined} className="space-y-3">
              <ProfileBasicInfoAccordion
                variant={variant}
                displayName={displayName}
                onDisplayNameChange={setDisplayName}
                tagline={tagline}
                onTaglineChange={setTagline}
                avatarUrl={avatarUrl}
                onAvatarUrlChange={setAvatarUrl}
                normalized={normalized}
                urlStyle={urlStyle}
                onEditHandle={() => setTab("settings")}
                prefs={prefs}
                setPref={setPref}
                blocks={blocks}
                onBlocksChange={setBlocks}
                saving={saving}
                savedAt={savedAt}
              />

              <LiveStatusAccordion prefs={prefs} setPref={setPref} composer={!isWorkspace && user ? { owner: user.id, handle: normalized || handle, space: alias ? "alias" : "root", blocks } : null} />

              <ProfileContentAccordion
                cardEffects={prefs.cardEffects}
                onCardEffectsChange={(value) => setPref("cardEffects", value)}
                blocks={blocks}
                onBlocksChange={setBlocks}
                openBlock={openBlock}
                onOpenBlockChange={setOpenBlock}
                onOpenAddDrawer={() => setDrawer(true)}
                onAddKind={(kind, value) => addBlock(kind, value)}
                handle={normalized || handle}
                linkMode={resolveLinkMode(normalizeDesignLayers(prefs.designLayers).linkDisplay, prefs.buttonShape)}
                profileCity={cityFromBadge(prefs.locationBadge)}
                onImportMeta={({ displayName: name, tagline: line }) => {
                  if (name) setDisplayName(name);
                  if (line) setTagline(line);
                }}
              />

              <ProfileWidgetsAccordion
                blocks={blocks}
                onOpenBlockChange={setOpenBlock}
                onAddKind={(kind, value) => addBlock(kind, value)}
                ensureBlock={(kind) => setBlocks((current) => ensureStudioWidget(current, kind))}
                onBlocksChange={setBlocks}
                profileCity={cityFromBadge(prefs.locationBadge)}
                handle={normalized || handle}
                designLayers={prefs.designLayers}
                onDesignLayersChange={(value) => setPref("designLayers", value)}
                isWorkspace={isWorkspace}
                qaSpace={alias ? "alias" : "root"}
                displayName={displayName || null}
                avatarUrl={avatarUrl || null}
                prefs={prefs}
                onPref={setPref}
                onWidget={(id) => {
                  if (id === "questions") {
                    if (!blocks.some(b => b.kind === "widget:questions")) addBlock("widget:questions");
                    setPref("questionsEnabled", true);
                    setPref("qaOnHub", true);
                    toast.success(t("studio.editor.questionsOn"));
                  } else if (id === "badges") {
                    if (!blocks.some(b => b.kind === "widget:badges")) addBlock("widget:badges");
                    setPref("badgeShowcaseVisible", true);
                    toast.success(t("studio.editor.badgesOn"));
                  } else if (id === "youtube") {
                    addBlock("widget:youtube");
                  } else {
                    if (!blocks.some(b => b.kind === "widget:guestbook")) addBlock("widget:guestbook");
                    setPref("guestbookEnabled", true);
                    toast.info(t("studio.editor.boardHelp"));
                  }
                }}
              />

              {/* Favorieten horen bij je links: film, serie, boek, muziek … */}
              <ProfileFavoritesAccordion
                favorites={prefs.favorites}
                onFavoritesChange={(next) => setPref("favorites", next)}
                layout={prefs.favoritesLayout}
                onLayoutChange={(next) => setPref("favoritesLayout", next)}
              />

              {/* ⚙️ Geavanceerde Instellingen: alles wat geen pagina-inhoud is. */}
              <p className="flex items-center gap-2 px-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <StudioSectionIcon kind="settings" className="size-4" />{t("studio.editor.advanced")}
              </p>
              <AccordionItem
                value="advanced_settings"
                className="acrylic-card px-4 sm:px-5"
              >
                <AccordionTrigger className="hover:no-underline">
                  <span className="flex min-w-0 items-center gap-2 text-base font-medium"><StudioSectionIcon kind="settings" />{t("studio.editor.privacySharing")}</span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-5">
                  {/* Eén bron van waarheid: QR-styling gebeurt in de generator (Sociale profielhub). */}
                  <section className="space-y-3 acrylic-card p-4 sm:p-5" data-tour="studio-qr" data-qr-container>
                    <h2 className="text-lg font-medium">{t(isWorkspace ? "studio.editor.qrWorkspace" : "studio.editor.qr")}</h2>
                    <p className="text-sm text-muted-foreground">{t("studio.editor.qrHelp")}</p>
                    <Button asChild variant="outline" className="h-auto min-h-11 w-full justify-start whitespace-normal text-left text-xs"><a
                      href={isWorkspace && workspaceSlug ? `/qr?type=profile_hub&workspace=${encodeURIComponent(workspaceSlug)}` : "/qr?type=profile_hub"}
                    >
                      <QrCode className="h-3.5 w-3.5" aria-hidden /> {t(isWorkspace ? "studio.editor.qrWorkspaceDownload" : "studio.editor.qrDownload")}
                    </a></Button>
                  </section>

                {/* 🔒 Privacy & Openbaar Profiel */}
                <section className="space-y-3 acrylic-card p-4 sm:p-5">
                  <h2 className="text-lg font-medium">{t("studio.editor.privacy")}</h2>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t("studio.editor.public")}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("studio.editor.publicHelp")}
                      </p>
                    </div>
                    <Switch
                      aria-label={t("studio.editor.public")}
                      checked={prefs.publicProfile}
                      onCheckedChange={(v) => setPref("publicProfile", v)}
                    />
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t("studio.editor.timeline")}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("studio.editor.timelineHelp")}
                      </p>
                    </div>
                    <Switch
                      aria-label={t("studio.editor.timeline")}
                      checked={prefs.timelineVisible}
                      disabled={!prefs.publicProfile}
                      onCheckedChange={(v) => setPref("timelineVisible", v)}
                    />
                  </div>
                </section>

                  <section className="space-y-3 acrylic-card p-4 sm:p-5">
                    <h2 className="text-lg font-medium">{t("studio.editor.share")}</h2>
                    <ShareInspector
                      space={isWorkspace ? "workspace" : variant === "alias" ? "alias" : "root"}
                      prefs={prefs}
                      onPrefChange={setPref}
                      displayName={displayName}
                      bio={tagline}
                      handle={isWorkspace ? (wsCanvas?.slug ?? workspaceSlug ?? "") : normalized || handle}
                    />
                    {!isWorkspace && <RoutCardLauncher handle={normalized || handle} space={alias ? "alias" : "root"} />}
                  </section>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            </div>
          )}
          {tab === "links" && (
              <ConversionCoachFab
                blocks={blocks}
                avatarUrl={avatarUrl}
                bio={tagline}
                displayName={displayName}
                prefs={prefs}
                onPrefChange={setPref}
                onAddKind={(kind) => addBlock(kind)}
                verified={verified}
                extraPageActive={tipEnabled}
              />
          )}

          {tab === "design" && (
            <Accordion type="single" collapsible className="space-y-3">
              <ProfileThemePicker
                displayName={displayName}
                onDisplayNameChange={setDisplayName}
                tagline={tagline}
                onTaglineChange={setTagline}
                avatarUrl={avatarUrl}
                onAvatarUrlChange={setAvatarUrl}
                faviconUrl={faviconUrl}
                onFaviconUrlChange={setFaviconUrl}
                theme={theme}
                onThemeChange={setTheme}
                cardStyle={cardStyle}
                onCardStyleChange={setCardStyle}
                prefs={prefs}
                setPref={setPref}
                verified={verified}
                blocks={blocks}
              />
              <LayerStudioAccordion
                value={prefs.designLayers}
                onChange={(v) => setPref("designLayers", v)}
                blocks={blocks}
                buttonShape={prefs.buttonShape}
              />
            </Accordion>
          )}

          {tab === "analytics" && <VisitorPanel defaultSpace={alias ? "alias" : "all"} />}
          {tab === "analytics" && <FeedbackPanel handle={normalized || handle} space={alias ? "alias" : "root"} />}
          {tab === "analytics" && <EventsPanel handle={normalized || handle} space={alias ? "alias" : "root"} />}
          {tab === "analytics" && (
            <section className="space-y-4 acrylic-card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-medium">{t("studio.editor.analytics")}</h2>
                <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
                  <SelectTrigger className="h-9 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RANGE_OPTIONS.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {t(`studio.range.${r.id}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("studio.editor.analyticsPrivacy")}
              </p>
              {!stats ? (
                <div className="flex h-24 items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    { label: t("studio.editor.dynamicQr"), value: stats.qrs },
                    { label: t("studio.editor.scans"), value: stats.scans },
                    { label: t("studio.editor.components"), value: blocks.filter((b) => b && !b.hidden).length },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-border p-3">
                      <p className="text-2xl font-medium">{s.value}</p>
                      <p className="text-[11px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-border p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">{t("studio.editor.trend")}</p>
                {series === null ? (
                  <div className="flex h-40 items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : series.length === 0 ? (
                  <div className="flex h-40 items-center justify-center text-center text-xs text-muted-foreground">
                    {t("studio.editor.emptyStats")}
                  </div>
                ) : (
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={series}>
                        <defs>
                          <linearGradient id="scanFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="currentColor" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip />
                        <Area
                          type="monotone"
                          dataKey="scans"
                          stroke="currentColor"
                          fill="url(#scanFill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Zelfde data als tabel — bij geen data toch één lege regel. */}
              <div className="overflow-hidden rounded-xl border border-border">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground">{t("studio.editor.table")}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {t("studio.editor.total", { count: (series ?? []).reduce((sum, r) => sum + r.scans, 0) })}
                  </p>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">{t("studio.editor.date")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("studio.editor.views")}</th>
                      <th className="px-3 py-2 text-left font-medium">{t("studio.editor.distribution")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(series ?? []).length === 0 ? (
                      <tr>
                        <td className="px-3 py-2.5 text-muted-foreground">—</td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">0</td>
                        <td className="px-3 py-2.5">
                          <div className="h-1.5 w-full rounded-full bg-muted" />
                        </td>
                      </tr>
                    ) : (
                      (series ?? []).map((row) => {
                        const peak = Math.max(1, ...(series ?? []).map((r) => r.scans));
                        return (
                          <tr key={row.date} className="border-t border-border/60">
                            <td className="px-3 py-2 text-muted-foreground">{row.date}</td>
                            <td className="px-3 py-2 text-right font-medium tabular-nums">
                              {row.scans}
                            </td>
                            <td className="px-3 py-2">
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-foreground"
                                  style={{
                                    width: `${row.scans === 0 ? 0 : Math.max(4, (row.scans / peak) * 100)}%`,
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-border p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t("studio.editor.top")}
                </p>
                {topClicked.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    {t("studio.editor.emptyClicks")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {topClicked.map(({ block, clicks }) => (
                      <li key={block.id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="truncate font-medium">{block.label}</span>
                          <span className="shrink-0 text-muted-foreground">{t("studio.editor.clicks", { count: clicks })}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-foreground"
                            style={{ width: `${Math.max(4, (clicks / maxClicks) * 100)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          {tab === "settings" && (
            <Accordion
              type="single"
              collapsible
              className="space-y-3"
              value={settingsSection}
              onValueChange={(v) => setSettingsSection(v || undefined)}
            >
              <AccordionItem
                value="billing"
                className="acrylic-card px-4 sm:px-5"
              >
                <AccordionTrigger className="hover:no-underline">
                  <span className="text-base font-medium">{t("studio.editor.billing")}</span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-5">
                  <section className="space-y-3 acrylic-card p-4 sm:p-5">
                    <h2 className="text-lg font-medium">{t("studio.editor.billingMethods")}</h2>
                    <p className="text-sm text-muted-foreground">
                      {t("studio.editor.billingHelp")}
                    </p>
                    <a
                      href="/studio/account?tab=payments"
                      className="inline-block rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      {t("studio.editor.billingLink")}
                    </a>
                  </section>

                  <ManualInvoicePanel />
                  <BillingHistoryPanel />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value="data_domain"
                className="acrylic-card px-4 sm:px-5"
              >
                <AccordionTrigger className="hover:no-underline">
                  <span className="text-base font-medium">{t("studio.editor.data")}</span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-5">
                  <section className="space-y-3 acrylic-card p-4 sm:p-5">
                    <h2 className="text-lg font-medium">{t("studio.editor.dataOwn")}</h2>
                    <p className="text-sm text-muted-foreground">
                      {t("studio.editor.dataHelp")}
                    </p>
                    <a
                      href="/studio/account?tab=data"
                      className="inline-block rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      {t("studio.editor.dataLink")}
                    </a>
                  </section>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value="seo_sharing"
                className="acrylic-card px-4 sm:px-5"
              >
                <AccordionTrigger className="hover:no-underline">
                  <span className="text-base font-medium">
                    {t("studio.editor.seo")}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-5">
                  <SocialSharingCard
                    space={variant === "alias" ? "alias" : "root"}
                    handle={handle || null}
                    displayName={displayName}
                    avatarUrl={avatarUrl}
                    bio={tagline}
                    prefs={prefs}
                    setPref={setPref}
                  />
                </AccordionContent>
              </AccordionItem>

              {!isWorkspace && (<>
              <AccordionItem
                value="identity_badges"
                className="acrylic-card px-4 sm:px-5"
              >
                <AccordionTrigger className="hover:no-underline">
                  <span className="text-base font-medium">{t("studio.editor.identity")}</span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-5">
                  <section className="acrylic-card p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-medium">
                        {isWorkspace
                          ? "Bedrijfsverificatie"
                          : alias
                            ? t("studio.editor.aliasTitle")
                            : t("studio.editor.verifiedTitle")}
                      </h2>
                      {alias && (
                        <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("studio.editor.aliasLimit")}
                        </span>
                      )}
                      {isWorkspace && verified && (
                        <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                          Geverifieerd bedrijf
                        </span>
                      )}
                    </div>
                    <p id="handle-help" className="mt-1 text-xs text-muted-foreground">
                      {isWorkspace
                        ? "De workspace-naam is de vaste slug. Claim je bedrijfsdomein op het tabblad Domains om rout.be/<julliedomein> te krijgen — dat is de verificatie van jullie organisatie."
                        : alias
                          ? t("studio.editor.aliasHint")
                          : handleRuleHint(handleCtx)}
                    </p>
                    {isWorkspace ? (
                      // De workspace-username ís de slug: vast, geen vrije invoer.
                      // Het live adres volgt het geverifieerde domein of /w/<slug>.
                      <div className="mt-3 space-y-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 font-mono text-sm text-muted-foreground">{host}/w/</span>
                          <span className="min-w-0 flex-1 truncate rounded-xl border border-border bg-muted/40 px-3 py-2.5 font-mono text-sm">
                            {wsCanvas?.slug ?? workspaceSlug}
                          </span>
                        </div>
                        <p className="break-all text-xs text-muted-foreground">
                          Live adres: <span className="font-mono text-foreground">{host}{publicPath}</span>
                          {wsDomain && !wsDomain.verified && " — domein nog niet geverifieerd (zie tabblad Domains)."}
                        </p>
                      </div>
                    ) : (
                    <>
                    <div className="mt-3 flex min-w-0 items-center gap-2">
                      <span className="shrink-0 font-mono text-sm text-muted-foreground">
                        {host}
                        {styledProfilePath("", urlStyle)}
                      </span>
                      <Input
                        ref={handleInputRef}
                        id={alias ? "alias_handle" : "verified_handle"}
                        name={alias ? "alias_handle" : "verified_handle"}
                        value={handle}
                        maxLength={30}
                        placeholder={t("studio.editor.yourname")}
                        minLength={HANDLE_MIN_LENGTH}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        inputMode="text"
                        aria-invalid={normalized ? !handleOk : undefined}
                        aria-describedby="handle-help"
                        onChange={(e) =>
                          // Geen @, spaties, cijferruis of symbolen: strak en leesbaar.
                          setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))
                        }
                        className="input-field h-11 min-w-0 flex-1 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-[invalid=true]:border-destructive"
                      />
                    </div>
                    {strictIssue && (
                      <HandleErrorBanner
                        message={
                          alias && strictIssue === MSG_ALIAS_DIGITS
                            ? ALIAS_DIGITS_HINT
                            : strictIssue
                        }
                        className="mt-3"
                      />
                    )}
                    {normalized && (
                      <p className="mt-2 break-all text-xs">
                        {!handleOk ? (
                          <span className="text-muted-foreground" role="status">
                            {handleProblem ?? handleIssue(normalized, handleCtx)}
                          </span>
                        ) : availability === "checking" ? (
                          <span className="text-muted-foreground">{t("studio.editor.checking")}</span>
                        ) : availability === "taken" ? (
                          <span className="inline-flex items-center gap-1 font-mono text-destructive">
                            <X className="h-3.5 w-3.5" /> {t("studio.editor.registered", { handle: normalized })}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-mono text-emerald-600 dark:text-emerald-400">
                            <Check className="h-3.5 w-3.5" /> {t("studio.editor.available", { handle: normalized })}
                          </span>
                        )}
                      </p>
                    )}
                    {verified && !alias && (
                      <div className="mt-4">
                        <VerifiedHandleBuilder
                          legalName={legalName}
                          hostPrefix={`${host}${styledProfilePath("", urlStyle)}`}
                          onSelect={(next) => setHandle(next)}
                        />
                      </div>
                    )}
                    </>
                    )}
                  </section>

                  {/* Gratis accounts hebben maar één publieke ruimte: de keuze
                      staat al bovenaan bij de profielkiezer, dus hier weg.
                      Persoonsgebonden (alias vs. wettelijke naam): nooit voor workspaces. */}
                  {verified && !isWorkspace && (
                  <section className="space-y-4 acrylic-card p-4 sm:p-5">
                    <div>
                      <h2 className="text-lg font-medium">{t("studio.editor.identityBadge")}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("studio.editor.twoSpaces")}
                      </p>
                    </div>


                    <div className="space-y-2">
                      <p className="input-label">{t("studio.editor.activeIdentity")}</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          {
                            id: "legal" as const,
                            space: "verified" as const,
                            label: t("studio.editor.legalName"),
                            note: "bv. rout.be/creatief",
                            pro: true,
                          },
                          {
                            id: "private" as const,
                            space: "alias" as const,
                            label: t("studio.editor.privateAlias"),
                            note: "bv. rout.be/u/creatief",
                            pro: false,
                          },
                        ].map((m) => {
                          const locked = m.pro && !verified;
                          const active = identitySpace === m.space;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              disabled={locked}
                              aria-disabled={locked}
                              onClick={() => {
                                if (locked) return;
                                setPref("identityMode", m.id);
                                selectIdentitySpace(m.space);
                                void saveUrlStylePref(
                                  (m.space === "alias" ? "u" : "clean") as UrlStyle,
                                );
                              }}
                              className={cn(
                                "min-w-[9rem] flex-1 rounded-xl border px-3 py-2 text-left text-xs transition-colors",
                                locked
                                  ? "cursor-not-allowed border-border opacity-60"
                                  : active
                                    ? "border-primary/50 bg-primary/10"
                                    : "border-border",
                              )}
                            >
                              <span className="flex items-center gap-1.5 font-medium">
                                {locked && <Lock className="h-3.5 w-3.5" aria-hidden />}
                                {m.label}
                                {locked && (
                                  <span className="ml-auto rounded bg-foreground px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-background">
                                    Pro
                                  </span>
                                )}
                              </span>
                              <span className="mt-0.5 block text-muted-foreground">{m.note}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] text-muted-foreground">

                        {t("studio.editor.aliasPrivacy")}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="input-label">{t("studio.editor.profileUrl")}</p>
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5">
                        <span className="truncate font-mono text-sm text-foreground">
                          {host}
                          {styledProfilePath(normalized || "handle", urlStyle)}
                        </span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {identitySpace === "verified" ? t("studio.editor.verified") : t("studio.editor.privateAlias")}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {t("studio.editor.urlHelp")}
                      </p>
                    </div>
                  </section>
                  )}

                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value="badges"
                className="acrylic-card px-4 sm:px-5"
              >
                <AccordionTrigger className="hover:no-underline">
                  <span className="text-base font-medium">{t("studio.editor.badgeTitle")}</span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-5">
                  <VerifiedBadgeCard verified={verified} handle={handle || null} />

                  <section className="space-y-4 acrylic-card p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background/60 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{t("studio.editor.showBadge")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("studio.editor.hideBadgeHelp")}
                        </p>
                      </div>
                      <Switch
                        aria-label={t("studio.editor.showBadge")}
                        disabled={!verified}
                        checked={prefs.badgeVisible}
                        onCheckedChange={(v) => setPref("badgeVisible", v)}
                      />
                    </div>

                    {/* Mens-badge: staat op je alias-pagina (rout.be/u/…) zodra je
                        hoofdaccount geverifieerd is. Altijd uitschakelbaar. */}
                    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background/60 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{t("studio.editor.humanBadge")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("studio.editor.humanHelp")}
                        </p>
                      </div>
                      <Switch
                        aria-label={t("studio.editor.humanBadge")}
                        disabled={!verified}
                        checked={prefs.humanBadgeVisible}
                        onCheckedChange={(v) => setPref("humanBadgeVisible", v)}
                      />
                    </div>

                    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background/60 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{t("studio.editor.collection")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("studio.editor.collectionHelp")}
                        </p>
                      </div>
                      <Switch
                        aria-label={t("studio.editor.collection")}
                        checked={prefs.badgeShowcaseVisible}
                        onCheckedChange={(v) => setPref("badgeShowcaseVisible", v)}
                      />
                    </div>

                    <div className="space-y-2">
                      <p className="input-label flex items-center gap-1">
                        {t("studio.editor.badgeType")}
                        <InfoHint label={t("studio.editor.whichBadge")}>
                          {t("studio.editor.badgeExplanation")}
                        </InfoHint>
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {BADGE_TYPES.filter(
                          (b) =>
                            (b.id !== "influencer" || approvedTiers.influencer) &&
                            (b.id !== "domain" || approvedTiers.business || Boolean(claimedDomainHandle)),
                        ).map((b) => {
                          const needsDomain = b.id === "domain" && !claimedDomainHandle;
                          return (
                            <button
                              key={b.id}
                              type="button"
                              disabled={!verified || !prefs.badgeVisible || needsDomain}
                              onClick={() => setPref("badgeType", b.id)}
                              className={cn(
                                "rounded-xl border px-3 py-2 text-left text-xs transition-colors disabled:opacity-50",
                                prefs.badgeType === b.id
                                  ? "border-primary/50 bg-primary/10"
                                  : "border-border",
                              )}
                            >
                              <span className="block font-medium">{b.label}</span>
                              <span className="block text-muted-foreground">
                                {needsDomain ? t("studio.editor.claimDomain") : b.note}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Achtergrondje achter de badge: houdt het vinkje leesbaar op
                        donkere of drukke achtergronden. */}
                    <div className="space-y-2">
                      <p className="input-label flex items-center gap-1">
                        {t("studio.editor.backdrop")}
                        <InfoHint label={t("studio.editor.backdropWhy")}>
                          {t("studio.editor.backdropHelp")}
                        </InfoHint>
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {BADGE_BACKDROPS.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            disabled={!prefs.badgeVisible}
                            onClick={() => setPref("badgeBackdrop", b.id)}
                            className={cn(
                              "rounded-xl border px-3 py-2 text-left text-xs transition-colors disabled:opacity-50",
                              prefs.badgeBackdrop === b.id
                                ? "border-primary/50 bg-primary/10"
                                : "border-border",
                            )}
                          >
                            <span className="block font-medium">{b.label}</span>
                            <span className="block text-muted-foreground">{b.note}</span>
                          </button>
                        ))}
                      </div>
                      {prefs.badgeBackdrop !== "none" && (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            aria-label={t("studio.editor.backdropColor")}
                            value={prefs.badgeBackdropColor ?? "#4ade80"}
                            onChange={(e) => setPref("badgeBackdropColor", e.target.value)}
                            className="h-11 w-14 cursor-pointer rounded-xl border border-border bg-transparent"
                          />
                          <Input
                            value={prefs.badgeBackdropColor ?? ""}
                            placeholder="#4ade80"
                            onChange={(e) =>
                              setPref("badgeBackdropColor", e.target.value.trim() || null)
                            }
                            className="input-field h-11 flex-1 rounded-xl font-mono"
                          />
                        </div>
                      )}
                    </div>

                    {prefs.badgeType === "verified" && (
                      <div className="space-y-2">
                        <p className="input-label">{t("studio.editor.nameDisplay")}</p>
                        <div className="flex flex-wrap gap-2">
                          {BADGE_NAME_FORMATS.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              disabled={!verified || !prefs.badgeVisible}
                              onClick={() => setPref("badgeNameFormat", f.id)}
                              className={cn(
                                "h-10 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors disabled:opacity-50",
                                prefs.badgeNameFormat === f.id
                                  ? "border-primary/50 bg-primary/10"
                                  : "border-border",
                              )}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>
                        {legalName && (
                          <p className="text-[11px] text-muted-foreground">
                            {t("studio.editor.example", { name: formatBadgeName(legalName, prefs.badgeNameFormat) })}
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                </AccordionContent>
              </AccordionItem>
              </>)}

              {/* Steunpagina: enkel voor geverifieerde leden met een root-handle (server-side afgedwongen). */}
              <AccordionItem
                value="support_page"
                className="acrylic-card px-4 sm:px-5"
              >
                <AccordionTrigger className="hover:no-underline">
                  <span className="text-base font-medium">{t("studio.editor.support")}</span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-5">
                  <ExtraPagesPanel handle={normalized} onTipEnabledChange={setTipEnabled} qaPath={`${alias ? "/u/" : "/"}${normalized}/ask`} qaPage={prefs.questionsEnabled && prefs.qaPage} onQaPageChange={(v) => { if (v) setPref("questionsEnabled", true); setPref("qaPage", v); }} />
                </AccordionContent>
              </AccordionItem>

            </Accordion>
          )}

          {tab === "identity" && (
            isWorkspace ? (
              <div className="space-y-4">
                {/* 1 — Waar de workspace woont: username, eigen domein, live adres. */}
                <section className="space-y-4 acrylic-card p-4 sm:p-5">
                  <div>
                    <h2 className="text-lg font-medium">Sovereign Address &amp; Domain</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Je ROUT-username en eigen bedrijfsdomein bepalen waar deze workspace live staat.</p>
                  </div>
                  <WorkspaceAddressCard workspaceId={wsCanvas?.workspaceId ?? ""} />
                  <div id="workspace-domain">
                    <WorkspaceDomainPanel
                      workspaceId={wsCanvas?.workspaceId ?? ""}
                      onVerified={() => setLoadAttempt((n) => n + 1)}
                    />
                  </div>
                </section>

                {/* 2 — Decentrale identiteiten: Bluesky, Mastodon rel="me", GitHub. */}
                <section className="space-y-4 acrylic-card p-4 sm:p-5">
                  <div>
                    <h2 className="text-lg font-medium">Decentrale identiteiten &amp; socials</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Bluesky-handle, Mastodon-verificatie en GitHub- of andere openbare profielen.</p>
                  </div>
                  <WorkspaceBlueskyPanel workspaceId={wsCanvas?.workspaceId ?? ""} />
                  <WorkspaceSocialPanel workspaceId={wsCanvas?.workspaceId ?? ""} />
                </section>

                {/* 3 — Verificatie & badges. */}
                <section className="space-y-3 acrylic-card p-4 sm:p-5">
                  <h2 className="text-lg font-medium">Verificatie &amp; badges</h2>
                  <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <span>Bedrijfsdomein</span>
                      <span className={verified ? "font-medium text-foreground" : "text-muted-foreground"}>
                        {wsDomain?.verified ? `Geverifieerd · ${wsDomain.name}` : wsDomain ? "Wacht op DNS-controle" : "Niet gekoppeld"}
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <span>ROUT-organisatiebadge</span>
                      <span className={verified ? "rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary" : "text-muted-foreground"}>
                        {verified ? "Geverifieerd bedrijf" : "Nog niet"}
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <span>eID &amp; passkeys (je eigen account)</span>
                      <a href="/settings" className="text-xs font-medium underline-offset-4 hover:underline">Beheren</a>
                    </li>
                  </ul>
                </section>
              </div>
            ) : !verified ? (
              <div className="acrylic-card p-4 sm:p-5">
                <SocialIdentityVerify />
              </div>
            ) : (
            <Accordion type="single" collapsible className="space-y-3">
              <AccordionItem value="social_verify" className="acrylic-card px-4 sm:px-5">
                <AccordionTrigger className="hover:no-underline">
                  <span className="text-base font-medium">Mastodon &amp; sociale accounts</span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-5">
                  <SocialIdentityVerify />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem
                value="subdomain_settings"
                className="acrylic-card px-4 sm:px-5"
              >
                <AccordionTrigger className="hover:no-underline">
                  <span className="flex min-w-0 items-center gap-2 text-base font-medium"><StudioSectionIcon kind="domain" />{t("studio.editor.domains")}</span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-5">
                  <SubdomainPanel />
                  <FediverseProfileField />
                  <EmailForwardingPanel />
                  <EmailAliasDomains />
                </AccordionContent>
              </AccordionItem>

              <AccordionItem
                value="bluesky_did"
                className="acrylic-card px-4 sm:px-5"
              >
                <AccordionTrigger className="hover:no-underline">
                  <span className="flex min-w-0 items-center gap-2 text-base font-medium"><StudioSectionIcon kind="bluesky" />{t("studio.editor.bluesky")}</span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pb-5">
                  <BlueskyWizard />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            )
          )}
        </div>

        {/* Live preview — desktop: volledig stationair naast de editor terwijl
            de formulieren links scrollen (z-10 < vaste header z-50) */}
        <ProfileHeaderPreview previewDraft={previewDraft} free={previewFree} publicPath={isWorkspace ? publicPath : undefined} />
      </div>
      </>
      )}

      {/* Low, compact mobile bar: subtle autosave status + primary live-preview action.
          Desktop already shows the pinned preview aside, so this bar is mobile-only. */}
      {localOffer && (
        <div role="status" className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-md rounded-xl border border-warning/40 bg-background/95 p-3 text-sm shadow-lg backdrop-blur lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0">
          <p className="flex items-start gap-2">
            <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <span>{t("studio.editor.localFound", { time: new Date(localOffer.savedAt).toLocaleString() })}</span>
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={dropLocalDraft}>{t("studio.editor.localDiscard")}</Button>
            <Button type="button" size="sm" onClick={restoreLocalDraft}>{t("studio.editor.localRestore")}</Button>
          </div>
        </div>
      )}
      {saveError && (
        <SaveErrorDialog
          error={saveError}
          open={errorOpen}
          onOpenChange={setErrorOpen}
          onRetry={() => { failCount.current = 0; void save(false); }}
          endpoint={alias ? "saveAliasProfile" : "saveStudioProfile"}
        />
      )}
      {showSaveBar && (
        <div
          aria-live="polite"
          className="fixed right-4 top-4 z-40 hidden items-center gap-1.5 rounded-full border border-border bg-background/80 px-3 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur lg:flex"
        >
          {saveError && !saving && indicator === "device-only" ? (
            <button type="button" onClick={() => setErrorOpen(true)} className="flex items-center gap-1.5 text-warning underline">
              <CloudOff className="h-3 w-3" aria-hidden /> {t("studio.editor.deviceOnly")}
            </button>
          ) : saveError && !saving ? (
            <button type="button" onClick={() => setErrorOpen(true)} className="text-destructive underline">
              {t("studio.editor.notSaved")}
            </button>
          ) : dirty && !saving && !handleOk ? (
            <span className="text-destructive">{t("studio.editor.notSaved")}{handleProblem || strictIssue ? ` — ${handleProblem ?? strictIssue}` : ""}</span>
          ) : saving || dirty ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {t("studio.editor.saving")}
            </>
          ) : savedAt ? (
            <>
              <Check className="h-3 w-3 text-primary" aria-hidden /> {t("studio.editor.saved")}
            </>
          ) : null}
        </div>
      )}
      {showSaveBar && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/70 px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-lg lg:hidden">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <p
              aria-live="polite"
              className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[11px] text-muted-foreground"
            >
              {saveError && !saving && indicator === "device-only" ? (
                <button type="button" onClick={() => setErrorOpen(true)} className="flex min-w-0 items-center gap-1.5 truncate text-left text-warning underline">
                  <CloudOff className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{t("studio.editor.deviceOnlyShort")}</span>
                </button>
              ) : saveError && !saving ? (
                <button
                  type="button"
                  onClick={() => setErrorOpen(true)}
                  className="truncate text-left text-destructive underline"
                >
                  {t("studio.editor.notSaved")}
                </button>
              ) : saving ? (
                <>
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden /> {t("studio.editor.saving")}
                </>
              ) : dirty && !handleOk ? (
                <span className="truncate text-destructive">{t("studio.editor.notSaved")}{handleProblem || strictIssue ? ` — ${handleProblem ?? strictIssue}` : ""}</span>
              ) : dirty ? (
                <>
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden /> {t("studio.editor.changesSaving")}
                </>
              ) : (
                <>
                  <Check
                    className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden
                  />
                  <span className="hidden min-[380px]:inline">{t("studio.editor.autosaved")}</span>
                  <span className="min-[380px]:hidden">{t("studio.editor.savedShort")}</span>
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-foreground px-4 text-xs font-medium text-background"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden /> {t("studio.editor.preview")}
            </button>
          </div>
        </div>
      )}

      {/* Mobile live preview — drawer with a phone-mockup frame */}
      <Drawer open={previewOpen} onOpenChange={setPreviewOpen}>
        <DrawerContent className="flex max-h-[92vh] flex-col">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <DrawerTitle className="text-sm font-medium">{t("studio.editor.previewTitle")}</DrawerTitle>
            <button
              type="button"
              aria-label={t("studio.editor.close")}
              onClick={() => setPreviewOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto bg-muted/30 p-4">
            <div data-interface-artwork className="mx-auto w-full max-w-[320px] rounded-[2.6rem] border border-border/70 bg-foreground/90 p-[10px] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)]">
              <div className="relative overflow-hidden rounded-[2rem] bg-background">
                <span className="absolute left-1/2 top-2 z-10 h-1.5 w-16 -translate-x-1/2 rounded-full bg-foreground/25" />
                <div className="scrollbar-slim aspect-[9/19.5] overflow-y-auto text-foreground">
                  <ProfileView profile={previewDraft} free={previewFree} publicPath={isWorkspace ? publicPath : undefined} preview />
                </div>
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={drawer} onOpenChange={setDrawer}>
        <DrawerContent
          className="flex max-h-[88vh] flex-col"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setDrawer(false);
            }
          }}
        >
          {/* Fixed header: title, search bar and categories stay visible */}
          <div className="shrink-0 border-b border-border bg-background">
            <div className="flex items-center justify-between px-4 pb-2">
              <DrawerTitle className="font-display text-lg">{t("studio.editor.add")}</DrawerTitle>
              <button
                type="button"
                aria-label={t("studio.editor.close")}
                onClick={() => setDrawer(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 pb-3">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData("text").trim();
                    if (/^(https?:\/\/)?[\w-]+(\.[\w-]+)+/.test(text) && !text.includes(" ")) {
                      e.preventDefault();
                      setQuery(text);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const first = groups[0]?.items[0];
                    if (first) addBlock(first.kind);
                  }}
                  placeholder={t("studio.editor.searchPlaceholder")}
                  className="input-field h-11 rounded-xl pl-9 pr-9"
                  aria-label={t("studio.editor.search")}
                />
                {(query || cat !== "all") && (
                  <button
                    type="button"
                    aria-label={t("studio.editor.clear")}
                    onClick={() => {
                      setQuery("");
                      setCat("all");
                    }}
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            {/* Curated high-value tabs */}
            <div className="overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max min-w-full items-center gap-2">
                {BLOCK_TABS.map((catalogTab) => (
                  <button
                    key={catalogTab.id}
                    type="button"
                    title={t(`studio.catalog.help.${catalogTab.id}`)}
                    onClick={() => setBlockTab(blockTab === catalogTab.id ? null : catalogTab.id)}
                    className={cn(
                      "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors",
                      blockTab === catalogTab.id
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t(`studio.catalog.tab.${catalogTab.id}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max min-w-full items-center gap-2">
                {[{ id: "all", label: t("studio.editor.all") }, ...BLOCK_CATEGORIES].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCat(c.id);
                      setBlockTab(null);
                    }}
                    className={cn(
                      "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors",
                      cat === c.id
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {c.id === "featured" && <Star className="h-3.5 w-3.5" aria-hidden />}
                    {t(`studio.catalog.category.${c.id}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="scrollbar-slim flex max-h-[60vh] min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-8 pt-3">
            {pastedUrl && (
              <button
                type="button"
                onClick={() => addBlock("link", pastedUrl)}
                className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-3 text-left transition-colors hover:border-primary/70"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40">
                  <SocialPlatformIcon source="link" className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium">{t("studio.editor.smartLink")}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {pastedUrl}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium">
                  {t("studio.editor.urlDetected")}
                </span>
              </button>
            )}
            {groups.length === 0 && !pastedUrl ? (
              <p className="py-6 text-center text-xs text-muted-foreground">{t("studio.editor.noResults")}</p>
            ) : (
              groups.map((g) => (
                <div key={g.id} className="space-y-2">
                  <div className="flex items-center gap-2 px-0.5">
                    {g.id === "featured" ? (
                      <Star className="h-3.5 w-3.5 text-primary" aria-hidden />
                    ) : (
                      <Folder className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    )}
                    <span
                      className={cn(
                        "text-[11px] font-medium uppercase tracking-wide",
                        g.id === "featured" ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {t(g.id === blockTab ? `studio.catalog.tab.${g.id}` : `studio.catalog.category.${g.id}`)}
                    </span>
                    <span className="text-[11px] text-muted-foreground">({g.items.length})</span>
                    {g.id === "featured" && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium">
                        {t("studio.editor.recommended")}
                      </span>
                    )}
                  </div>
                  {/* Compacte kaartengrid in plaats van volle-breedte rijen */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {g.items.map((k) => (
                      <button
                        key={k.kind}
                        type="button"
                        onClick={() => addBlock(k.kind)}
                        title={k.label}
                        className={cn(
                          "group flex min-w-0 flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                          g.id === "featured"
                            ? "border-primary/40 bg-primary/5 hover:border-primary/70"
                            : "border-border bg-card hover:border-foreground/25",
                        )}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 transition-transform duration-200 group-hover:scale-105">
                          <SocialPlatformIcon source={k.kind} className="h-[18px] w-[18px]" />
                        </span>
                        <span className="w-full truncate text-xs font-medium">{k.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
