import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { ProfileView } from "@/components/profile/ProfileView";
import { TourAccountStep } from "@/components/tour/TourAccountStep";
import { TourAvatarStep } from "@/components/tour/TourAvatarStep";
import { TourBackgroundStep } from "@/components/tour/TourBackgroundStep";
import { TourFooterStep } from "@/components/tour/TourFooterStep";
import { TourIntroStep } from "@/components/tour/TourIntroStep";
import { TourProfileStep, type HandleState } from "@/components/tour/TourProfileStep";
import { TourProgress } from "@/components/tour/TourProgress";
import { TourSocialsStep, TOUR_SOCIALS } from "@/components/tour/TourSocialsStep";
import { TourTypographyStep } from "@/components/tour/TourTypographyStep";
import { useI18n } from "@/lib/i18n";
import { checkHandleAvailability } from "@/lib/bootstrap.functions";
import { beginAuthIntent, saveTourDraftToken } from "@/lib/tour-draft.functions";
import {
  EMPTY_TOUR_DRAFT,
  LAST_TOUR_STEP,
  newTourToken,
  readLocalTourDraft,
  writeLocalTourDraft,
  type TourDraft,
} from "@/lib/tour-draft";
import { normalizeHandleForStorage } from "@/lib/handle-rules";
import { strictHandleIssue } from "@/lib/handle-validation";
import { DEFAULT_DISPLAY_PREFS } from "@/lib/profile-display";
import { themeOf, type ProfileBlock, type ProfileRecord } from "@/lib/profile";

/**
 * /tour — de publieke rondleiding. Op desktop staan de vragen links en het
 * levende voorbeeld rechts; op mobiel staat het voorbeeld eronder.
 *
 * Elke keuze wordt lokaal én anoniem in Neon bewaard (op een willekeurig
 * token). De laatste stap stuurt naar het gewone registratievenster; na login
 * haalt /onboarding het concept met datzelfde token weer op.
 */
export default function Tour() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [draft, setDraft] = useState<TourDraft>(EMPTY_TOUR_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [handleState, setHandleState] = useState<HandleState>("idle");
  const [handleReason, setHandleReason] = useState<string | undefined>(undefined);
  const checkTimer = useRef<number | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);

  const patch = useCallback((next: Partial<TourDraft>) => {
    setDraft((prev) => ({ ...prev, ...next }));
  }, []);

  // 1. Concept uit deze browser terughalen (nooit tijdens SSR) of er één starten.
  useEffect(() => {
    const local = readLocalTourDraft();
    const base = local?.token ? local : { ...(local ?? EMPTY_TOUR_DRAFT), token: newTourToken() };
    // ?handle=... komt van de claim-knop op /about: meteen door naar stap 1.
    const wanted = new URLSearchParams(window.location.search).get("handle") ?? "";
    const prefill = normalizeHandleForStorage(wanted);
    setDraft(prefill ? { ...base, handle: prefill, step: Math.max(base.step, 1) } : base);
    setHydrated(true);
  }, []);

  // 2. Autosave: altijd lokaal, en anoniem naar Neon op het concept-token.
  useEffect(() => {
    if (!hydrated || !draft.token) return;
    writeLocalTourDraft(draft);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveTourDraftToken({ data: { token: draft.token, draft } }).catch(() => {
        /* het lokale concept blijft de bron van waarheid */
      });
    }, 800);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [draft, hydrated]);

  // 3. Live handlecheck (debounced) tegen de database.
  const normalized = normalizeHandleForStorage(draft.handle);
  const issue = strictHandleIssue(draft.handle, { alias: true });

  useEffect(() => {
    if (checkTimer.current) window.clearTimeout(checkTimer.current);
    if (!normalized || issue) {
      setHandleState("idle");
      setHandleReason(issue ?? undefined);
      return;
    }
    setHandleState("checking");
    setHandleReason(undefined);
    checkTimer.current = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await checkHandleAvailability({ data: { handle: normalized } });
          setHandleState(res.ok ? "ok" : "taken");
          setHandleReason(res.ok ? undefined : (res.reason ?? undefined));
        } catch {
          setHandleState("error");
        }
      })();
    }, 300);
    return () => {
      if (checkTimer.current) window.clearTimeout(checkTimer.current);
    };
  }, [normalized, issue]);

  const blocks: ProfileBlock[] = useMemo(
    () =>
      TOUR_SOCIALS.filter((s) => (draft.socials[s.kind] ?? "").trim() !== "").map((s) => ({
        id: `tour-${s.kind}`,
        kind: s.kind,
        label: s.label,
        value: (draft.socials[s.kind] ?? "").trim(),
      })),
    [draft.socials],
  );

  const preview: ProfileRecord = useMemo(
    () => ({
      id: "tour-preview",
      username: normalized || "jouwnaam12",
      display_name: draft.displayName || t("tour.preview.name"),
      tagline: draft.bio || null,
      avatar_url: draft.avatarUrl.trim() || null,
      theme: draft.theme,
      card_style: "bordered",
      blocks,
      verified: false,
      status: "active",
      display_prefs: {
        ...DEFAULT_DISPLAY_PREFS,
        typography: draft.typography,
        backgroundStyle: draft.backgroundStyle,
        wallpaperType: draft.wallpaperType,
        ...(draft.wallpaperColor ? { wallpaperColor: draft.wallpaperColor } : {}),
        wallpaperGradient: draft.wallpaperGradient,
        fontPairing: draft.fontPairing,
        footerTagline: draft.footerTagline,
        footerStyle: draft.footerStyle,
        ...(draft.footerAccent ? { footerAccent: draft.footerAccent } : {}),
        showRoutBadge: draft.showRoutBadge,
      },
    }),
    [normalized, blocks, draft, t],
  );

  const steps = [
    t("tour.steps.intro"),
    t("tour.steps.profile"),
    t("tour.steps.socials"),
    t("tour.steps.background"),
    t("tour.steps.typography"),
    t("tour.steps.footer"),
    t("tour.steps.avatar"),
    t("tour.steps.account"),
  ];

  const canContinue = draft.step !== 1 || handleState === "ok";

  const register = useCallback(async () => {
    // Laatste versie meteen opslaan, daarna token + bestemming in HttpOnly-cookies.
    writeLocalTourDraft(draft);
    await saveTourDraftToken({ data: { token: draft.token, draft } }).catch(() => null);
    await beginAuthIntent({ data: { draftToken: draft.token, next: "/onboarding" } }).catch(() => null);
    nav("/auth");
  }, [draft, nav]);

  return (
    <AppLayout
      width="wide"
      title={t("tour.meta.title")}
      description={t("tour.meta.description")}
      crumbs={[{ label: t("tour.meta.crumb") }]}
    >
      <div className="mx-auto w-full max-w-6xl space-y-6 pb-28">
        <TourProgress steps={steps} current={draft.step} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
            {draft.step === 0 ? <TourIntroStep /> : null}
            {draft.step === 1 ? (
              <TourProfileStep
                handle={draft.handle}
                displayName={draft.displayName}
                bio={draft.bio}
                state={handleState}
                reason={handleReason}
                onHandle={(value) => patch({ handle: value })}
                onDisplayName={(value) => patch({ displayName: value })}
                onBio={(value) => patch({ bio: value })}
              />
            ) : null}
            {draft.step === 2 ? (
              <TourSocialsStep
                socials={draft.socials}
                onChange={(kind, value) =>
                  patch({ socials: { ...draft.socials, [kind]: value } })
                }
              />
            ) : null}
            {draft.step === 3 ? (
              <TourBackgroundStep
                theme={draft.theme}
                backgroundStyle={draft.backgroundStyle}
                wallpaperType={draft.wallpaperType}
                wallpaperColor={draft.wallpaperColor}
                wallpaperGradient={draft.wallpaperGradient}
                onTheme={(value) => patch({ theme: value })}
                onBackgroundStyle={(value) => patch({ backgroundStyle: value })}
                onWallpaperType={(value) => patch({ wallpaperType: value })}
                onWallpaperColor={(value) => patch({ wallpaperColor: value })}
                onWallpaperGradient={(value) => patch({ wallpaperGradient: value })}
              />
            ) : null}
            {draft.step === 4 ? (
              <TourTypographyStep
                typography={draft.typography}
                fontPairing={draft.fontPairing}
                onTypography={(value) => patch({ typography: value })}
                onFontPairing={(value) => patch({ fontPairing: value })}
              />
            ) : null}
            {draft.step === 5 ? (
              <TourFooterStep
                tagline={draft.footerTagline}
                style={draft.footerStyle}
                accent={draft.footerAccent}
                showRoutBadge={draft.showRoutBadge}
                onTagline={(value) => patch({ footerTagline: value })}
                onStyle={(value) => patch({ footerStyle: value })}
                onAccent={(value) => patch({ footerAccent: value })}
                onShowRoutBadge={(value) => patch({ showRoutBadge: value })}
              />
            ) : null}
            {draft.step === 6 ? (
              <TourAvatarStep
                avatarUrl={draft.avatarUrl}
                displayName={draft.displayName}
                onAvatarUrl={(value) => patch({ avatarUrl: value })}
              />
            ) : null}
            {draft.step === LAST_TOUR_STEP ? (
              <TourAccountStep
                handle={normalized}
                displayName={draft.displayName}
                onRegister={register}
              />
            ) : null}
          </div>

          {/* Voorbeeld: rechts op desktop, onder de vragen op mobiel. */}
          {draft.step > 0 ? (
            <section aria-label={t("tour.preview.label")} className="space-y-3 lg:sticky lg:top-24">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("tour.preview.label")}
              </p>
              <div
                className="overflow-hidden rounded-[2rem] border border-border shadow-lg"
                style={{ background: themeOf(draft.theme)?.bg }}
              >
                <div className="max-h-[70vh] overflow-y-auto">
                  <ProfileView profile={preview} free />
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {/* Sticky navigatiebalk (duimbereik op mobiel). */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            disabled={draft.step === 0}
            onClick={() => patch({ step: Math.max(0, draft.step - 1) })}
          >
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
            {t("tour.nav.back")}
          </Button>
          <Button
            type="button"
            disabled={draft.step === LAST_TOUR_STEP || !canContinue}
            onClick={() => patch({ step: Math.min(LAST_TOUR_STEP, draft.step + 1) })}
          >
            {t("tour.nav.next")}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
