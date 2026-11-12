import { errorMessage } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Link as RouterLink } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Copy, Check, BarChart3, Loader2, X, ExternalLink, Globe, Link2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { QRType } from "./QRTypeSelector";
import {
  allocateSlug,
  customLinkPrefix,
  isSlugAvailable,
  mergeKind,
  namespacedSlug,
  normalizeSlug,
  shortLinkBase,
  randomToken,
  shortLinkUrl,
  shortLinkQrValue,
  validateSlug,
  type QrKind,
} from "@/lib/short-links";

import { limitsFor, shortLinkBlockReason, studioTier, type TierInput } from "@/lib/studio-limits";
import { CanvasIndicator } from "@/components/CanvasIndicator";

export interface TrackedQR {
  id: string;
  slug: string;
  dashboard_token: string;
  target_type: string;
  target_url: string;
  label: string | null;
  redirect_url: string;
  created_at: string;
  kind?: QrKind;
  custom_domain?: string | null;
}

interface TrackingPanelProps {
  qrType: QRType;
  targetUrl: string; // resolved URL for the current QR (empty if not ready)
  tracked: TrackedQR | null;
  onTrackedChange: (t: TrackedQR | null) => void;
  suggestedLabel?: string;
}

const TRACKABLE_TYPES: QRType[] = ["url", "image", "pdf", "mp3", "app"];

function localHistoryKey() {
  return "qr_tracking_history_v1";
}

export function addToHistory(t: TrackedQR) {
  try {
    const raw = localStorage.getItem(localHistoryKey());
    const arr: TrackedQR[] = raw ? JSON.parse(raw) : [];
    const filtered = arr.filter((x) => x.slug !== t.slug);
    filtered.unshift(t);
    localStorage.setItem(localHistoryKey(), JSON.stringify(filtered.slice(0, 50)));
  } catch {
    // ignore
  }
}

function normalizeUrl(v: string): string {
  const trimmed = v.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function TrackingPanel({ qrType, targetUrl, tracked, onTrackedChange, suggestedLabel }: TrackingPanelProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [copyMessage, setCopyMessage] = useState("");

  const [label, setLabel] = useState("");
  useEffect(() => { if (suggestedLabel && !tracked) setLabel(suggestedLabel); }, [suggestedLabel, tracked]);
  // Verified branded domains this user may publish links on.
  const [domains, setDomains] = useState<
    { domain: string; is_default: boolean; status: string; short_links_enabled: boolean }[]
  >([]);
  const [domainChoice, setDomainChoice] = useState<string>("default");
  // Optional vanity code; empty means "give me a random one".
  const [slugInput, setSlugInput] = useState("");
  // Guest vs member vs verified: drives quota, vanity codes and the CTA copy.
  const [tierInput, setTierInput] = useState<TierInput>({ signedIn: false });
  const [linkCount, setLinkCount] = useState(0);
  // Eigen codes hangen altijd onder de handle van de eigenaar.
  const [handle, setHandle] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!user) {
        if (!cancelled) setTierInput({ signedIn: false });
        return;
      }
      const [{ data: profile }, { count }] = await Promise.all([
        db
          .from("profiles")
          .select("username, verified, is_paid, is_early_believer")
          .eq("id", user.id)
          .maybeSingle(),
        db.from("tracked_qrs").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      if (!cancelled) {
        setTierInput({
          signedIn: true,
          verified: profile?.verified ?? null,
          isPaid: profile?.is_paid ?? null,
          isEarlyBeliever: profile?.is_early_believer ?? null,
        });
        setHandle((profile?.username as string | null) ?? null);
        setLinkCount(count ?? 0);
      }
      // Every connected domain is listed with its status; only a verified
      // domain with short links switched on can actually be picked.
      const { data } = await db
        .from("custom_domains")
        .select("domain, is_default, status, short_links_enabled")
        .order("is_default", { ascending: false });
      if (cancelled || !data) return;
      setDomains(data);
      const preferred = data.find(
        (d: { is_default: boolean; status: string; short_links_enabled: boolean }) =>
          d.is_default && d.status === "verified" && d.short_links_enabled,
      );
      if (preferred) setDomainChoice(preferred.domain);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Label for the built-in domain (rout.be in production, the preview host otherwise).
  const routHost = shortLinkBase(null).replace(/^https?:\/\//, "") || "rout.be";

  const usableDomain = (d: { status: string; short_links_enabled: boolean }) =>
    d.status === "verified" && d.short_links_enabled;

  const domainStatusLabel = (d: { status: string; short_links_enabled: boolean }) => {
    if (d.status !== "verified") return t("track.notVerified");
    return d.short_links_enabled ? "actief" : "uitgeschakeld";
  };

  const isTrackable = TRACKABLE_TYPES.includes(qrType);
  const ready = targetUrl.trim().length > 0;
  const tier = studioTier(tierInput);
  const limits = limitsFor(tierInput);
  // Een eigen code hangt onder de handle: `rout.be/<handle>/` voor
  // geverifieerde accounts, `rout.be/u/<alias>/` voor gratis profielen.
  const namespaceVerified = tier === "verified";
  const canUseVanity = limits.canPickVanitySlug && Boolean(handle);
  const vanityPrefix = handle
    ? customLinkPrefix(handle, namespaceVerified, domainChoice === "default" ? null : domainChoice)
    : null;
  const blockReason = shortLinkBlockReason(tierInput, linkCount, slugInput.trim().length > 0);
  // Voorbeeldpayload voor de canvas-indicator: de echte code als die er is,
  // anders een representatieve 4-teken Base36-code op het gekozen domein.
  const previewPayload = tracked
    ? tracked.redirect_url.toUpperCase()
    : shortLinkQrValue("A89K", domainChoice === "default" ? null : domainChoice);

  if (!isTrackable) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 p-4 text-sm text-muted-foreground">
        Statistieken &amp; tracking zijn beschikbaar voor URL&apos;s, afbeeldingen, PDF&apos;s,
        MP3&apos;s en app-links. Wi-Fi-, tekst-, e-mail- en SMS-QR-codes worden direct door de
        scanner gelezen en kunnen niet worden omgeleid.
      </div>
    );
  }

  const handleCreate = async () => {
    const normalized = normalizeUrl(targetUrl);
    if (!normalized) {
      toast.error(t("track.addLinkFirst"));
      return;
    }
    setLoading(true);
    try {
      if (!user) {
        toast.error(t("track.signIn"));
        return;
      }
      // Guest/verified-grenzen: de quota blokkeert, een vanity code zonder
      // verificatie valt netjes terug op een gegenereerde ROUT-code.
      const wantsVanity = slugInput.trim().length > 0;
      const quotaBlock = shortLinkBlockReason(tierInput, linkCount, false);
      if (quotaBlock) {
        toast.error(quotaBlock);
        return;
      }
      const vanityAllowed = canUseVanity;
      if (wantsVanity && !vanityAllowed) {
        toast.info(t("track.vanityVerified"));
      }

      // Een eigen code wordt hier gevalideerd en onder de eigen namespace
      // geclaimd (`<handle>/apple` of `u/<alias>/apple`); anders rollen we er
      // een willekeurige root-code voor.
      let slug: string | null;
      if (wantsVanity && vanityAllowed && handle) {
        const check = validateSlug(slugInput);
        if (!check.slug) {
          toast.error(check.error ?? t("track.slugInvalid"));
          return;
        }
        const full = namespacedSlug(handle, namespaceVerified, check.slug);
        if (!(await isSlugAvailable(full))) {
          toast.error(t("track.slugTaken"));
          return;
        }
        slug = full;
      } else {
        slug = await allocateSlug();
      }

      if (!slug) throw new Error("Could not allocate a short code");

      const picked = domains.find((d) => d.domain === domainChoice);
      if (domainChoice !== "default" && (!picked || !usableDomain(picked))) {
        toast.error(t("track.domainUnverified"));
        return;
      }
      const custom_domain = domainChoice === "default" ? null : domainChoice;
      const { data, error } = await db
        .from("tracked_qrs")
        .insert({
          slug,
          dashboard_token: randomToken(24),
          target_type: qrType,
          target_url: normalized,
          label: label || null,
          user_id: user.id,
          custom_domain,
          kind: "qr" satisfies QrKind,
        })
        .select(
          "id, slug, dashboard_token, target_type, target_url, label, custom_domain, kind, created_at",
        )
        .single();

      if (error || !data) {
        // De databank remt te snel aanmaken af (spam-bescherming); dat is een
        // verwachte uitkomst, geen crash.
        if (error?.message?.includes("RATE_LIMIT_SHORT_LINKS")) {
          toast.error(t("track.rateLimit"));
          return;
        }
        throw new Error(error?.message ?? "Failed to create tracked link");
      }

      const entry: TrackedQR = {
        ...data,
        kind: (data.kind as QrKind) ?? "qr",
        redirect_url: shortLinkQrValue(data.slug, data.custom_domain),
      };
      onTrackedChange(entry);
      addToHistory(entry);
      setLinkCount((n) => n + 1);
      setSlugInput("");
      toast.success(t("track.ready"));
    } catch (e: unknown) {
      console.error(e);
      toast.error(errorMessage(e, t("track.createFailed")));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Promote a tracked QR to a shareable short link. Same row, same stats — the
   * only thing that changes is that the owner now uses the URL directly too.
   */
  const handleMakeShortLink = async () => {
    if (!tracked) return;
    setLoading(true);
    try {
      const nextKind = mergeKind(tracked.kind ?? "qr", "link");
      const { error } = await db
        .from("tracked_qrs")
        .update({ kind: nextKind, short_link_enabled: true })
        .eq("id", tracked.id);
      if (error) throw new Error(error.message);
      onTrackedChange({ ...tracked, kind: nextKind });
      await copy(tracked.redirect_url, t("track.copiedShort"));
    } catch (e: unknown) {
      console.error(e);
      toast.error(errorMessage(e, t("track.shortFailed")));
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = () => {
    onTrackedChange(null);
    setLabel("");
  };

  /**
   * Copy with an accessible outcome: the result is mirrored in a polite live
   * region so screen readers announce it, and a failure keeps a retry visible
   * instead of vanishing with the toast.
   */
  const copy = async (v: string, msg: string) => {
    setCopyState("busy");
    setCopyMessage(t("track.copying"));
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(v);
      setCopied(true);
      setCopyState("done");
      setCopyMessage(msg);
      setTimeout(() => {
        setCopied(false);
        setCopyState("idle");
        setCopyMessage("");
      }, 2500);
      toast.success(msg);
    } catch {
      setCopyState("error");
      setCopyMessage(t("track.copyFailedLong"));
      toast.error(t("track.copyFailed"));
    }
  };

  if (tracked) {
    const statsPath = `/stats/${tracked.dashboard_token}`;
    const statsUrl = `${window.location.origin}${statsPath}`;
    return (
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-foreground" />
            <span className="text-sm font-medium">{t("track.enabled")}</span>
          </div>
          <button
            onClick={handleRemove}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <X className="w-3 h-3" /> {t("track.remove")}
          </button>
        </div>

        <div className="space-y-1">
          <label htmlFor="short-link-value" className="block text-xs text-muted-foreground">
            Korte link (zit in de QR-code)
          </label>
          <div className="flex gap-2">
            <Input
              id="short-link-value"
              readOnly
              value={tracked.redirect_url}
              className="h-10 text-xs font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => copy(tracked.redirect_url, t("track.copiedShort"))}
              aria-label={t("track.copyShortAria")}
            >
              <Copy className="w-4 h-4" aria-hidden />
            </Button>
          </div>
          {/* Primary, unmissable copy action with an inline confirmation. */}
          <Button
            type="button"
            className="mt-2 h-10 w-full text-xs font-semibold"
            disabled={copyState === "busy"}
            aria-describedby="short-link-copy-status"
            onClick={() => copy(tracked.redirect_url, t("track.copiedShort"))}
          >
            {copyState === "busy" ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" aria-hidden /> Kopiëren…
              </>
            ) : copied ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1.5" aria-hidden /> Gekopieerd naar klembord
              </>
            ) : copyState === "error" ? (
              <>
                <Copy className="w-3.5 h-3.5 mr-1.5" aria-hidden /> Opnieuw proberen
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1.5" aria-hidden /> Kopieer short link
              </>
            )}
          </Button>
          {/* Announced by screen readers; also visible for sighted keyboard users. */}
          <p
            id="short-link-copy-status"
            role="status"
            aria-live="polite"
            className={`min-h-[1rem] text-[11px] ${
              copyState === "error" ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {copyMessage}
          </p>

          {tracked.kind === "qr" ? (
            <Button
              type="button"
              variant="outline"
              className="w-full h-9 mt-2 text-xs"
              disabled={loading}
              onClick={handleMakeShortLink}
            >
              <Link2 className="w-3.5 h-3.5 mr-1.5" /> Ook als short link delen
            </Button>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Gedeeld als short link — scans en klikken tellen samen op.
            </p>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("track.statsPrivate")}</p>
          <div className="flex gap-2">
            <Input readOnly value={statsUrl} className="h-10 text-xs font-mono" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => copy(statsUrl, t("track.statsCopied"))}
              aria-label={t("track.statsCopyAria")}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Iedereen met deze link kan je scanstatistieken bekijken. Verlies je hem, dan is hij niet
            te herstellen.
          </p>
        </div>

        <RouterLink
          to={statsPath}
          className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
        >
          Open dashboard <ExternalLink className="w-3.5 h-3.5" />
        </RouterLink>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-foreground" />
        <span className="text-sm font-medium">{t("track.trackScans")}</span>
      </div>
      <p className="text-xs text-muted-foreground">{t("track.trackScansBody")}</p>
      <Input
        placeholder={t("track.labelPlaceholder")}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="h-10"
      />
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" /> {t("track.domainLabel")}
        </p>
        <Select value={domainChoice} onValueChange={setDomainChoice}>
          <SelectTrigger className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">{`${routHost} (${t("track.default")})`}</SelectItem>
            {domains.map((d) => (
              <SelectItem key={d.domain} value={d.domain} disabled={!usableDomain(d)}>
                <span className="flex items-center gap-2">
                  <span>{d.domain}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {domainStatusLabel(d)}
                    {d.is_default && usableDomain(d) ? ` · ${t("track.default")}` : ""}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {domains.length > 0 && !domains.some(usableDomain) && (
          <p className="text-[11px] text-muted-foreground">
            {t("track.domainsNotReady")}{" "}
            <RouterLink to="/domains" className="underline hover:text-foreground">
              {t("track.manageDomains")}
            </RouterLink>
          </p>
        )}
        {domains.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            {t("track.ownDomainQuestion")}{" "}
            <RouterLink to="/domains" className="underline hover:text-foreground">
              {t("track.connectDomain")}
            </RouterLink>{" "}
            {t("track.enableShortLinksThere")}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5" /> {t("track.customCode")}
        </p>
        {/* Vast voorvoegsel: een eigen code leeft altijd onder je eigen
            handle, nooit in de root — zo kan niemand een handle kapen. */}
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <span className="min-w-0 shrink-0 break-all font-mono text-xs text-muted-foreground">
            {vanityPrefix ??
              `${shortLinkBase(domainChoice === "default" ? null : domainChoice).replace(/^https?:\/\//, "")}/…/`}
          </span>
          <Input
            placeholder={canUseVanity ? "apple" : t("track.vanityPlaceholder")}
            value={slugInput}
            onChange={(e) => setSlugInput(normalizeSlug(e.target.value))}
            disabled={!canUseVanity}
            className="h-10 min-w-0 flex-1 font-mono text-xs"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          {canUseVanity ? t("track.randomHint") : t("track.guestHint")}
        </p>
      </div>

      {/* Canvasgrootte: de code schaalt automatisch mee met de payload. */}
      <CanvasIndicator payload={previewPayload} />

      <Button
        type="button"
        onClick={handleCreate}
        disabled={!ready || loading || blockReason !== null}
        className="w-full h-10"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("track.createCta")}
      </Button>
      {blockReason && <p className="text-[11px] text-muted-foreground">{blockReason}</p>}
      {tier !== "guest" && (
        <p className="text-[11px] text-muted-foreground">
          {t("track.usage", {
            used: linkCount,
            max: limits.maxShortLinks,
            hour: limits.maxShortLinksPerHour,
          })}
        </p>
      )}
      {!ready && (
        <p className="text-[11px] text-muted-foreground">
          Voeg een link toe of upload een bestand om tracking aan te zetten.
        </p>
      )}
    </div>
  );
}
