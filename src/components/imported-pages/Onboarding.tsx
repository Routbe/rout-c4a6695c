import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles, X } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Altcha } from "@/components/Altcha";
import { takeProof } from "@/lib/altcha-client";
import { SocialHandleInput } from "@/components/SocialHandleInput";
import { normalizeSocialHandle } from "@/lib/social-handles";
import { ProfileView } from "@/components/profile/ProfileView";
import { useAuth } from "@/hooks/useAuth";
import { notifyError, notifySuccess } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { checkHandleAvailability, suggestHandlesFromEmailAddress } from "@/lib/bootstrap.functions";
import { claimHandle, getMyHandle } from "@/lib/claim.functions";
import { saveStudioProfile } from "@/lib/studio-profile.functions";
import { PROFILE_THEMES, themeOf, type ProfileBlock, type ProfileRecord } from "@/lib/profile";
import { DEFAULT_DISPLAY_PREFS, TYPOGRAPHY_STYLES, type Typography } from "@/lib/profile-display";
import { handleLengthMessage, normalizeHandleForStorage } from "@/lib/handle-rules";
import { strictHandleIssue } from "@/lib/handle-validation";
import { HandleErrorBanner } from "@/components/HandleValidationMessage";
import { clearLocalTourDraft, readLocalTourDraft, type TourDraft } from "@/lib/tour-draft";
import {
  discardMyTourDraft,
  discardTourDraftToken,
  getMyTourDraft,
  getTourDraftByToken,
} from "@/lib/tour-draft.functions";
import type { ProfileDisplayPrefs } from "@/lib/profile-display";

/** Concept-token uit de rondleiding (`/onboarding?draft=…`). */
function readDraftToken(): string {
  // Het token reist niet meer via de URL; alleen een lokaal concept kent het nog.
  return "";
}

/** Zet de ontwerpkeuzes uit de rondleiding om in weergavevoorkeuren. */
function draftPrefs(draft: TourDraft): Partial<ProfileDisplayPrefs> {
  return {
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
  };
}

/** Wizardstappen — de voortgangsbalk bovenaan volgt exact deze volgorde. */
const STEPS = [
  { id: 1, title: "Handle & identiteit" },
  { id: 2, title: "Foto & bio" },
  { id: 3, title: "Thema & lettertype" },
  { id: 4, title: "Sociale handles" },
] as const;

/** De vier snelle sociale velden uit stap 4. */
const SOCIALS = [
  { kind: "instagram", label: "Instagram" },
  { kind: "tiktok", label: "TikTok" },
  { kind: "x", label: "X" },
  { kind: "github", label: "GitHub" },
] as const;

type Tier = "free" | "pro";
type Availability = { state: "idle" | "checking" | "ok" | "taken" | "error"; reason?: string };

/** Leest de OAuth-metadata (Google / GitHub) uit de sessie. */
function readOAuthMeta(meta: Record<string, unknown> | undefined) {
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = meta?.[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  };
  return {
    avatarUrl: pick("avatar_url", "picture"),
    fullName: pick("full_name", "name", "display_name"),
  };
}

/**
 * /onboarding — de soevereine, vierstaps wizard voor nieuwe leden.
 *
 * Alles wat de wizard verzamelt landt in Neon Postgres: de handle via
 * `claimHandle`, de rest van het profiel via `saveStudioProfile`. Rechts staat
 * een live voorbeeld dat bij elke klik mee verandert.
 */
export default function Onboarding() {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [step, setStep] = useState(1);
  const [handle, setHandle] = useState("");
  const [availability, setAvailability] = useState<Availability>({ state: "idle" });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [tier, setTier] = useState<Tier>("free");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [oauthAvatar, setOauthAvatar] = useState("");
  const [theme, setTheme] = useState("noir");
  const [typography, setTypography] = useState<Typography>("sans");
  const [socials, setSocials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [tourPrefs, setTourPrefs] = useState<Partial<ProfileDisplayPrefs>>({});
  const [draftToken, setDraftToken] = useState("");
  const timer = useRef<number | undefined>(undefined);

  // 1. OAuth auto-fill: avatar, naam en e-mail komen rechtstreeks uit de sessie.
  useEffect(() => {
    if (!user || prefilled) return;
    const { avatarUrl: avatar, fullName } = readOAuthMeta(user.user_metadata);
    if (avatar) {
      setOauthAvatar(avatar);
      setAvatarUrl(avatar);
    }
    if (fullName) setDisplayName(fullName);
    setPrefilled(true);

    // Rondleiding-concept: eerst deze browser, anders het serverconcept.
    void (async () => {
      const token = readDraftToken();
      const local = readLocalTourDraft();
      const draft =
        (token
          ? await getTourDraftByToken({ data: { token } })
              .then((r) => r.draft)
              .catch(() => null)
          : null) ??
        (await getMyTourDraft({})
          .then((r) => r.draft)
          .catch(() => null)) ??
        local;
      if (!draft) return;
      setDraftToken(token || draft.token || local?.token || "");
      if (draft.handle) setHandle((prev) => prev || draft.handle);
      if (draft.displayName) setDisplayName((prev) => prev || draft.displayName);
      if (draft.bio) setBio((prev) => prev || draft.bio);
      if (draft.avatarUrl) setAvatarUrl((prev) => prev || draft.avatarUrl);
      if (draft.theme) setTheme(draft.theme);
      if (draft.typography) setTypography(draft.typography);
      if (draft.socials && Object.keys(draft.socials).length > 0) {
        setSocials((prev) => ({ ...draft.socials, ...prev }));
      }
      setTourPrefs(draftPrefs(draft));
    })();

    void (async () => {
      try {
        const mine = await getMyHandle({});
        if (mine.handle) {
          nav("/studio", { replace: true });
          return;
        }
        const res = await suggestHandlesFromEmailAddress({ data: { email: user.email } });
        const list = res.handles ?? [];
        setSuggestions(list);
        setHandle((prev) => prev || list[0] || "");
      } catch {
        /* suggesties zijn comfort, nooit blokkerend */
      }
    })();
  }, [user, prefilled, nav]);

  useEffect(() => {
    if (!authLoading && !user) nav("/auth/sign-in", { replace: true });
  }, [authLoading, user, nav]);

  // 2. Live beschikbaarheidscheck tegen Neon Postgres (debounced).
  const normalized = normalizeHandleForStorage(handle);
  const strictIssue = strictHandleIssue(handle);
  const ruleError = strictIssue ?? handleLengthMessage(normalized);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!normalized || ruleError) {
      setAvailability({ state: "idle", ...(ruleError ? { reason: ruleError } : {}) });
      return;
    }
    setAvailability({ state: "checking" });
    timer.current = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await checkHandleAvailability({ data: { handle: normalized } });
          setAvailability(
            res.ok
              ? { state: "ok" }
              : { state: "taken", ...(res.reason ? { reason: res.reason } : {}) },
          );
        } catch {
          setAvailability({ state: "error" });
        }
      })();
    }, 300);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [normalized, ruleError]);

  const blocks: ProfileBlock[] = useMemo(
    () =>
      SOCIALS.filter((s) => (socials[s.kind] ?? "").trim() !== "").map((s) => ({
        id: `onboarding-${s.kind}`,
        kind: s.kind,
        label: s.label,
        value: normalizeSocialHandle(socials[s.kind] ?? ""),
      })),
    [socials],
  );

  // 3. Live preview: exact dezelfde renderer als het publieke profiel.
  const preview: ProfileRecord = useMemo(
    () => ({
      id: user?.id ?? "preview",
      username: normalized || "jouwhandle",
      display_name: displayName || "Jouw naam",
      tagline: bio || null,
      avatar_url: avatarUrl || null,
      theme,
      card_style: "bordered",
      blocks,
      verified: tier === "pro",
      status: "active",
      display_prefs: { ...DEFAULT_DISPLAY_PREFS, typography },
    }),
    [user?.id, normalized, displayName, bio, avatarUrl, theme, blocks, tier, typography],
  );

  const canContinue = step !== 1 || (availability.state === "ok" && !strictIssue);

  const finish = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    try {
      const claim = await claimHandle({ data: { handle: normalized, altcha: await takeProof() } });
      if (!claim.ok) {
        notifyError(claim.reason ?? "Deze handle kon niet gereserveerd worden.");
        setStep(1);
        return;
      }
      const saved = await saveStudioProfile({
        data: {
          username: normalized,
          displayName: displayName.trim() || null,
          tagline: bio.trim() || null,
          avatarUrl: avatarUrl.trim() || null,
          theme,
          cardStyle: "bordered",
          blocks: blocks as unknown as Record<string, string>[],
          displayPrefs: { ...tourPrefs, typography },
        },
      });
      if (!saved.ok) {
        notifyError(saved.reason ?? "Opslaan mislukte.");
        return;
      }
      clearLocalTourDraft();
      if (draftToken) {
        void discardTourDraftToken({ data: { token: draftToken } }).catch(() => {
          /* opruimen is comfort, nooit blokkerend */
        });
      }
      void discardMyTourDraft({}).catch(() => {
        /* opruimen is comfort, nooit blokkerend */
      });
      notifySuccess("Je ROUT-profiel staat klaar.");
      nav("/studio", { replace: true });
    } catch {
      notifyError("Opslaan mislukte. Probeer het opnieuw.");
    } finally {
      setSaving(false);
    }
  }, [user, normalized, displayName, bio, avatarUrl, theme, blocks, typography, tourPrefs, draftToken, nav]);

  return (
    <AppLayout
      width="wide"
      title="Welkom bij ROUT"
      description="Vier stappen en je soevereine profiel staat live."
      crumbs={[{ label: "Onboarding" }]}
    >
      {authLoading || !user ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-8 pb-12 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-6">
            {/* Voortgangsbalk */}
            <div className="space-y-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground transition-all duration-300"
                  style={{ width: `${(step / STEPS.length) * 100}%` }}
                />
              </div>
              <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {STEPS.map((s) => (
                  <li
                    key={s.id}
                    className={cn(
                      "font-medium",
                      s.id === step ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {s.id}. {s.title}
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
              {step === 1 ? (
                <div className="space-y-5">
                  <div className="space-y-1">
                    <h2 className="text-xl font-medium">Claim je handle</h2>
                    <p className="text-sm text-muted-foreground">
                      Dit wordt je adres: rout.be/{normalized || "jouwhandle"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="handle">Handle</Label>
                    <div className="relative">
                      <Input
                        id="handle"
                        value={handle}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        onChange={(e) => setHandle(e.target.value)}
                        placeholder="jouw.naam42"
                        className="h-12 pr-10"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2">
                        {availability.state === "checking" ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : availability.state === "ok" ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : availability.state === "taken" ? (
                          <X className="h-4 w-4 text-destructive" />
                        ) : null}
                      </span>
                    </div>
                    {strictIssue && <HandleErrorBanner message={strictIssue} />}
                    {!strictIssue && (ruleError || availability.reason) ? (
                      <p className="text-xs text-muted-foreground">
                        {ruleError ?? availability.reason}
                      </p>
                    ) : null}
                    {suggestions.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {suggestions.slice(0, 4).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setHandle(s)}
                            className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      {
                        id: "free" as const,
                        title: "Gratis alias",
                        note: "Direct live op rout.be/u/ met je eigen handle.",
                      },
                      {
                        id: "pro" as const,
                        title: "Verified Pro",
                        note: "Blauw vinkje en schone namespace na verificatie.",
                      },
                    ].map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setTier(option.id)}
                        className={cn(
                          "rounded-2xl border p-4 text-left transition",
                          tier === option.id
                            ? "border-foreground bg-muted/60"
                            : "border-border hover:bg-muted/40",
                        )}
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {option.id === "pro" ? <Sparkles className="h-4 w-4" /> : null}
                          {option.title}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {option.note}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-5">
                  <div className="space-y-1">
                    <h2 className="text-xl font-medium">Profielfoto & bio</h2>
                    <p className="text-sm text-muted-foreground">
                      We laadden alvast je foto en naam uit je login.
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Profielfoto"
                        className="h-16 w-16 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground">
                        —
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setAvatarUrl(oauthAvatar)}
                        disabled={!oauthAvatar || avatarUrl === oauthAvatar}
                      >
                        Behouden
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAvatarUrl("")}
                      >
                        Vervangen
                      </Button>
                    </div>
                  </div>

                  {avatarUrl !== oauthAvatar ? (
                    <div className="space-y-2">
                      <Label htmlFor="avatar">Eigen afbeeldings-URL</Label>
                      <Input
                        id="avatar"
                        value={avatarUrl}
                        onChange={(e) => setAvatarUrl(e.target.value)}
                        placeholder="https://…"
                        className="h-11"
                      />
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor="display-name">Weergavenaam</Label>
                    <Input
                      id="display-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={80}
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bio">Korte bio</Label>
                    <Textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value.slice(0, 200))}
                      rows={3}
                      placeholder="Waar sta je voor?"
                    />
                    <p className="text-xs text-muted-foreground">{bio.length}/200</p>
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-6">
                  <div className="space-y-1">
                    <h2 className="text-xl font-medium">Thema & lettertype</h2>
                    <p className="text-sm text-muted-foreground">
                      Kies je stijl — het voorbeeld verandert meteen mee.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {PROFILE_THEMES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTheme(t.id)}
                        className={cn(
                          "rounded-2xl border p-3 text-left transition",
                          theme === t.id ? "border-foreground" : "border-border hover:bg-muted/40",
                        )}
                      >
                        <span
                          className="mb-2 block h-10 w-full rounded-lg border"
                          style={{ background: t.bg, borderColor: t.border }}
                        />
                        <span className="text-xs font-medium">{t.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {TYPOGRAPHY_STYLES.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setTypography(f.id)}
                        className={cn(
                          "rounded-full border px-4 py-2 text-xs transition",
                          typography === f.id
                            ? "border-foreground bg-muted/60"
                            : "border-border hover:bg-muted/40",
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {step === 4 ? (
                <div className="space-y-5">
                  <div className="space-y-1">
                    <h2 className="text-xl font-medium">Sociale handles</h2>
                    <p className="text-sm text-muted-foreground">
                      Alleen je gebruikersnaam — plak gerust een volledige URL.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {SOCIALS.map((s) => (
                      <SocialHandleInput
                        key={s.kind}
                        kind={s.kind}
                        label={s.label}
                        value={socials[s.kind] ?? ""}
                        onChange={(next) => setSocials((prev) => ({ ...prev, [s.kind]: next }))}
                      />
                    ))}
                  </div>

                  <Altcha />
                </div>
              ) : null}

              <div className="mt-8 flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep((s) => Math.max(1, s - 1))}
                  disabled={step === 1 || saving}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Terug
                </Button>

                {step < STEPS.length ? (
                  <Button
                    type="button"
                    onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}
                    disabled={!canContinue}
                  >
                    Volgende
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="button" onClick={() => void finish()} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Naar mijn Studio ➔
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Live preview */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Live voorbeeld
            </p>
            <div
              className="overflow-hidden rounded-[2rem] border border-border shadow-lg"
              style={{ background: themeOf(theme)?.bg }}
            >
              <div className="max-h-[70vh] overflow-y-auto">
                <ProfileView profile={preview} free={tier === "free"} />
              </div>
            </div>
          </aside>
        </div>
      )}
    </AppLayout>
  );
}
