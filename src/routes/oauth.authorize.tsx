import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { RoutLogo } from "@/components/RoutLogo";
import { AtSign, BadgeCheck, Bot, Check, Eye, Fingerprint, IdCard, KeyRound, Loader2, Lock, Mail, PenLine, QrCode, ShieldCheck, User } from "lucide-react";
import { OPTIONAL_SCOPES, consentDelta } from "@/lib/oauth/scope-rules";
import { BHM_PARAM, BHM_SCOPE, parseBlindHashes, type BhmIdentity } from "@/lib/oauth/blind-hash";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  addOwnerRedirect,
  describeAuthorizeRequest,
  decideAuthorizeRequest,
  getMyMatchIdentities,
  sendStepUpCode,
  verifyStepUp,
  startPasskeyStepUpFn,
  finishPasskeyStepUpFn,
  silentAuthorize,
  type AuthorizePrompt,
} from "@/lib/oauth/console.functions";

type Search = {
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  nonce?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  response_type?: string;
  prompt?: string;
  max_age?: string;
  acr_values?: string;
  login_hint?: string;
};

export const Route = createFileRoute("/oauth/authorize")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    client_id: typeof search["client_id"] === "string" ? search["client_id"] : undefined,
    redirect_uri: typeof search["redirect_uri"] === "string" ? search["redirect_uri"] : undefined,
    scope: typeof search["scope"] === "string" ? search["scope"] : undefined,
    state: typeof search["state"] === "string" ? search["state"] : undefined,
    nonce: typeof search["nonce"] === "string" ? search["nonce"] : undefined,
    code_challenge:
      typeof search["code_challenge"] === "string" ? search["code_challenge"] : undefined,
    code_challenge_method:
      typeof search["code_challenge_method"] === "string"
        ? search["code_challenge_method"]
        : undefined,
    response_type:
      typeof search["response_type"] === "string" ? search["response_type"] : undefined,
    prompt: typeof search["prompt"] === "string" ? search["prompt"] : undefined,
    max_age:
      typeof search["max_age"] === "string" || typeof search["max_age"] === "number"
        ? String(search["max_age"])
        : undefined,
    acr_values: typeof search["acr_values"] === "string" ? search["acr_values"] : undefined,
    login_hint: typeof search["login_hint"] === "string" ? search["login_hint"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: i18next.t("auth.meta.consent") },
      {
        name: "description",
        content: i18next.t("auth.meta.consentDescription"),
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: i18next.t("auth.meta.consent") },
      {
        property: "og:description",
        content: i18next.t("auth.meta.consentDescription"),
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthorizePage,
});

const SCOPE_TEXT: Record<string, { icon: typeof User; text: string }> = {
  openid: { icon: KeyRound, text: "auth.scope.openid" },
  profile: { icon: User, text: "auth.scope.profile" },
  email: { icon: Mail, text: "auth.scope.email" },
  linked_accounts: {
    icon: ShieldCheck,
    text: "auth.scope.linked_accounts",
  },
  "accounts:merge": { icon: ShieldCheck, text: "auth.scope.accountsMerge" },
  "identity:handle_reservation": { icon: AtSign, text: "auth.scope.handleReservation" },
  "sybil:verify": { icon: Fingerprint, text: "auth.scope.sybil" },
  "profile:read": { icon: User, text: "auth.scope.profileRead" },
  "identity:legal_name": { icon: IdCard, text: "auth.scope.legalName" },
  "identity:national_id": { icon: Lock, text: "auth.scope.nationalId" },
  "assets:write": { icon: QrCode, text: "auth.scope.agentAssets" },
  "profile:draft": { icon: PenLine, text: "auth.scope.agentDraft" },
  "identity:read_public": { icon: Bot, text: "auth.scope.agentIdentity" },
};

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  apple: "Apple",
  github: "GitHub",
  gitlab: "GitLab",
  microsoft: "Microsoft",
  infomaniak: "Infomaniak",
  oidc: "ROUT ID",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  discord: "Discord",
  linkedin: "LinkedIn",
};

function AuthorizePage() {
  const { t } = useTranslation();
  const addRedirect = useServerFn(addOwnerRedirect);
  const [repairError, setRepairError] = useState(false);
  const search = Route.useSearch();
  const { user, loading, signOut } = useAuth();
  const describe = useServerFn(describeAuthorizeRequest);
  const decide = useServerFn(decideAuthorizeRequest);
  const sendCode = useServerFn(sendStepUpCode);
  const verifyCode = useServerFn(verifyStepUp);
  const silent = useServerFn(silentAuthorize);
  const isSilent = (search.prompt ?? "").split(" ").includes("none");
  const [prompt, setPrompt] = useState<AuthorizePrompt | null>(null);
  const [busy, setBusy] = useState(false);
  const [richOptIn, setRichOptIn] = useState(false);
  const [emailChoice, setEmailChoice] = useState<string | null>(null);
  // Optional identity scopes start off for legal data, on for the rest.
  const [declined, setDeclined] = useState<string[]>(["identity:legal_name"]);
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [stepUpDone, setStepUpDone] = useState(false);
  // Blind Hash Matching: partner hashes arrive in the URL fragment (never sent to
  // any server), are kept for this tab only and compared inside the enclave worker.
  const [blindHashes, setBlindHashes] = useState<string[]>([]);
  const [matches, setMatches] = useState<BhmIdentity[]>([]);
  const [matchChoice, setMatchChoice] = useState<number | null>(null);
  const matchIdentities = useServerFn(getMyMatchIdentities);

  const payload = {
    clientId: search.client_id ?? "",
    redirectUri: search.redirect_uri ?? "",
    scope: search.scope ?? "openid",
    state: search.state ?? null,
    nonce: search.nonce ?? null,
    codeChallenge: search.code_challenge ?? "",
    codeChallengeMethod: search.code_challenge_method ?? "",
    prompt: search.prompt ?? null,
    maxAge: search.max_age ?? null,
    acrValues: search.acr_values ?? null,
    loginHint: search.login_hint ?? null,
  };

  // The authorization request a step-up proof is bound to (server re-derives the id).
  const binding = {
    clientId: payload.clientId,
    redirectUri: payload.redirectUri,
    state: payload.state,
    nonce: payload.nonce,
    codeChallenge: payload.codeChallenge,
  };
  const startPasskey = useServerFn(startPasskeyStepUpFn);
  const finishPasskey = useServerFn(finishPasskeyStepUpFn);

  async function confirmPasskey() {
    setBusy(true);
    setCodeError(null);
    try {
      const start = (await startPasskey({ data: binding })) as
        | { ok: true; options: Record<string, unknown> }
        | { ok: false; error: string };
      if (!start.ok) return setCodeError(start.error);
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const assertion = await startAuthentication({ optionsJSON: start.options as never });
      const r = await finishPasskey({ data: { ...binding, assertion: assertion as never } });
      if (r.ok) setStepUpDone(true);
      else setCodeError(r.error);
    } catch {
      setCodeError(t("auth.consent.verifyFailed"));
    } finally {
      setBusy(false);
    }
  }

  // Niet ingelogd? Eerst aanmelden, daarna terug naar exact dit scherm.
  // prompt=none: never show a screen — redirect back with a code or an OIDC error.
  useEffect(() => {
    if (!isSilent || loading) return;
    if (!payload.clientId || !payload.redirectUri) {
      setPrompt({ ok: false, error: t("auth.consent.missing") });
      return;
    }
    silent({ data: payload })
      .then((r) => {
        if ("redirectTo" in r) window.location.replace(r.redirectTo);
        else setPrompt({ ok: false, error: r.error });
      })
      .catch(() => setPrompt({ ok: false, error: t("auth.consent.checkFailed") }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSilent, loading]);

  useEffect(() => {
    if (isSilent || loading || user) return;
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/auth/sign-in?next=${encodeURIComponent(next)}`;
  }, [loading, user]);

  useEffect(() => {
    if (!user || isSilent) return;
    if (search.response_type && search.response_type !== "code") {
      setPrompt({ ok: false, error: t("auth.consent.codeFlow") });
      return;
    }
    if (!payload.clientId || !payload.redirectUri) {
      setPrompt({ ok: false, error: t("auth.consent.missing") });
      return;
    }
    describe({ data: payload })
      .then(setPrompt)
      .catch(() => setPrompt({ ok: false, error: t("auth.consent.checkFailed") }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, search.client_id, search.redirect_uri, search.scope, search.code_challenge]);

  useEffect(() => {
    const key = `rout.bhm.${search.client_id ?? ""}`;
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, "")).get(BHM_PARAM);
    if (fromHash) {
      sessionStorage.setItem(key, fromHash);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
    setBlindHashes(parseBlindHashes(sessionStorage.getItem(key)));
  }, [search.client_id]);

  const wantsMerge = (prompt?.scopes ?? []).includes(BHM_SCOPE);
  useEffect(() => {
    if (!user || !prompt?.ok || !wantsMerge || blindHashes.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { identities } = await matchIdentities();
        const { enclave } = await import("@/lib/crypto-enclave/client");
        const hits = await enclave.bhm.match(payload.clientId, blindHashes, identities);
        // Keep only matching identities; the rest is dropped from this screen.
        const found = hits.map((i) => identities[i]).filter((i): i is BhmIdentity => Boolean(i));
        if (!cancelled) {
          setMatches(found);
          setMatchChoice(found.length === 1 ? 0 : null);
        }
      } catch {
        if (!cancelled) setMatches([]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, prompt?.ok, wantsMerge, blindHashes.join(",")]);

  async function requestCode() {
    setBusy(true);
    setCodeError(null);
    try {
      const r = await sendCode({ data: binding });
      if (r.ok) setCodeSentTo(r.sentTo ?? t("auth.consent.email"));
      else setCodeError(r.error ?? t("auth.consent.sendFailed"));
    } catch {
      setCodeError(t("auth.consent.sendFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode() {
    if (!/^\d{6}$/.test(code)) {
      setCodeError(t("auth.consent.six"));
      return;
    }
    setBusy(true);
    setCodeError(null);
    try {
      const r = await verifyCode({ data: { ...binding, code } });
      if (r.ok) setStepUpDone(true);
      else setCodeError(r.error);
    } catch {
      setCodeError(t("auth.consent.verifyFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function switchAccount() {
    setBusy(true);
    const next = `${window.location.pathname}${window.location.search}`;
    try {
      await signOut();
    } finally {
      window.location.href = `/auth/sign-in?next=${encodeURIComponent(next)}`;
    }
  }

  async function choose(allow: boolean) {
    setBusy(true);
    try {
      const result = await decide({ data: { ...payload, allow, richIdentityOptIn: richOptIn, emailChoice: emailChoice ?? prompt?.emailChoice, declinedScopes: prompt?.trustedKycPartner ? declined : [...declined, "identity:national_id"],
        ...(allow && matchChoice !== null && matches[matchChoice] && !declined.includes(BHM_SCOPE)
          ? { blindHashes, matchedIdentity: matches[matchChoice] }
          : {}) } });
      sessionStorage.removeItem(`rout.bhm.${payload.clientId}`);
      if ("redirectTo" in result) window.location.href = result.redirectTo;
      else if (result.error.startsWith(t("auth.confirm"))) {
        setStepUpDone(false);
        setCodeError(result.error);
      } else setPrompt({ ok: false, error: result.error });
    } catch {
      setPrompt({ ok: false, error: t("auth.retry") });
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user || !prompt) {
    return (
      <main className="dark flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>{!loading && !user ? t("auth.consent.signingIn") : t("auth.consent.checking")}</span>
        </div>
      </main>
    );
  }

  if (!prompt.ok) {
    return (
      <main className="dark flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-2xl">
          <h1 className="font-display text-xl text-foreground">{t("auth.consent.invalid")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{prompt.error}</p>
          <p className="mt-4 text-xs text-muted-foreground">
            {t("auth.consent.noRedirect")}
          </p>
          {prompt.debug && (
            <div className="mt-6 space-y-3 break-all text-sm">
              <p>{t("auth.consent.mismatch", { received: prompt.debug.received, expected: prompt.debug.expected.join(", ") })}</p>
              <Button disabled={busy} onClick={async () => {
                setBusy(true);
                setRepairError(false);
                try {
                  await addRedirect({ data: { clientId: payload.clientId, redirectUri: payload.redirectUri } });
                  setPrompt(await describe({ data: payload }));
                } catch { setRepairError(true); }
                finally { setBusy(false); }
              }}>{t("auth.consent.add")}</Button>
              {repairError && <p role="alert">{t("auth.consent.failed")}</p>}
            </div>
          )}
        </div>
      </main>
    );
  }

  const appName = prompt.app?.name ?? t("auth.consent.app");
  const handle = prompt.account?.handle;
  const needsCode = Boolean(prompt.requiresStepUp) && !stepUpDone;
  const scopes = prompt.scopes ?? [];
  // Incremental consent ("Verifiëren met ROUT"): only new items after an earlier grant.
  const { incremental, shown: shownScopes, previouslyGranted } = consentDelta(scopes, prompt.grantedScopes ?? [], search.prompt ?? null);

  return (
    <main className="dark flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-2xl">
        {/* App ↔ ROUT */}
        <div className="flex items-center justify-center gap-3">
          {prompt.app?.logoUrl ? (
            <img
              src={prompt.app.logoUrl}
              alt=""
              className="h-12 w-12 rounded-2xl border border-border object-cover"
            />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border text-base font-medium text-muted-foreground">
              {appName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="flex items-center gap-1" aria-hidden>
            <span className="h-1 w-1 rounded-full bg-muted-foreground" />
            <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
            <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
          </span>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background">
            <RoutLogo className="h-6 w-auto" />
          </span>
        </div>

        <h1 className="mt-6 text-center font-display text-2xl leading-tight">
          {t("auth.consent.title", { name: appName })}
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">{t("auth.consent.identity")}</p>
        <div className="mt-3 flex justify-center"><PrivacyBadge kind="sovereign-identity" /></div>

        {/* Ingelogd als */}
        <div className="mt-6 rounded-2xl border border-border bg-background/60 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t("auth.consent.signedIn")}
          </p>
          <div className="mt-3 flex items-center gap-3">
            {prompt.account?.avatarUrl ? (
              <img
                src={prompt.account.avatarUrl}
                alt=""
                className="h-11 w-11 rounded-full border border-border object-cover"
              />
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-sm text-muted-foreground">
                {(handle ?? prompt.account?.email ?? "?").slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {prompt.account?.name || (handle ? `@${handle}` : prompt.account?.email)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {handle ? `rout.be/${handle} · ` : ""}
                {prompt.account?.email}
              </p>
            </div>
            <Check className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </div>
          {(prompt.linkedProviders?.length ?? 0) > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t("auth.consent.linked")}</span>
              {prompt.linkedProviders!.map((p) => (
                <span key={p} className="rounded-full border border-border px-2 py-0.5 text-xs capitalize">
                  {PROVIDER_LABEL[p] ?? p}
                </span>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={switchAccount}
            disabled={busy}
            className="mt-3 text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("auth.consent.switch")}
          </button>
        </div>
        {scopes.includes(BHM_SCOPE) && matches.length > 0 && !declined.includes(BHM_SCOPE) && (
          <fieldset className="mt-4 rounded-2xl border border-primary/40 bg-primary/5 p-4">
            <legend className="px-1 text-sm font-medium">{t("auth.consent.bhm.title", { app: appName })}</legend>
            <p className="text-xs text-muted-foreground">{t("auth.consent.bhm.body", { app: appName })}</p>
            <div className="mt-3 space-y-2">
              {matches.map((m, i) => (
                <label key={`${m.kind}:${m.value}`} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-background p-3 text-sm">
                  <input type="radio" name="bhm" className="h-4 w-4" checked={matchChoice === i} onChange={() => setMatchChoice(i)} />
                  {m.kind === "email" ? <Mail className="h-4 w-4 shrink-0" aria-hidden /> : <User className="h-4 w-4 shrink-0" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate">
                    {m.kind === "email" ? m.value : t("auth.consent.bhm.provider", { provider: PROVIDER_LABEL[m.kind] ?? m.kind })}
                  </span>
                </label>
              ))}
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">
                <input type="radio" name="bhm" className="h-4 w-4" checked={matchChoice === null} onChange={() => setMatchChoice(null)} />
                {t("auth.consent.bhm.none")}
              </label>
            </div>
          </fieldset>
        )}

        {/* Transparantie */}
        <p className="mt-6 text-sm">{incremental ? t("auth.consent.incremental", { app: appName }) : t(scopes.some((scope) => scope !== "openid") ? "auth.consent.summary" : "auth.consent.identityOnly")}</p>
        <ul className="mt-3 space-y-2">
          {shownScopes.map((scope) => {
            const item = SCOPE_TEXT[scope];
            const Icon = item?.icon ?? ShieldCheck;
            return (
              <li key={scope} className="flex items-start gap-3 text-sm text-muted-foreground">
                <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span className="flex-1">{item ? t(item.text, { app: appName }) : scope}</span>
                {OPTIONAL_SCOPES.includes(scope) && scope !== "identity:national_id" && (
                  <Checkbox
                    aria-label={item ? t(item.text, { app: appName }) : scope}
                    checked={!declined.includes(scope)}
                    onCheckedChange={(v) => setDeclined((d) => (v ? d.filter((x) => x !== scope) : [...d, scope]))}
                  />
                )}
                {scope === "identity:national_id" && (
                  <Checkbox
                    aria-label={t("auth.scope.nationalId")}
                    disabled={!prompt.trustedKycPartner}
                    checked={prompt.trustedKycPartner === true && !declined.includes(scope)}
                    onCheckedChange={(v) => setDeclined((d) => (v ? d.filter((x) => x !== scope) : [...d, scope]))}
                  />
                )}
              </li>
            );
          })}
        </ul>
        {incremental && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("auth.consent.previously", { app: appName, count: String(previouslyGranted.length) })}
          </p>
        )}

        {prompt.trustedKycPartner && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <BadgeCheck className="h-4 w-4" aria-hidden /> {t("auth.consent.trustedPartner")}
          </p>
        )}

        {scopes.includes("email") && (prompt.emailOptions?.length ?? 0) > 1 && (
          <fieldset className="mt-4 space-y-2 rounded-2xl border border-border p-3 text-sm">
            <legend className="px-1 text-xs font-medium text-muted-foreground">{t("auth.consent.emailPick")}</legend>
            {prompt.emailOptions!.map((o) => (
              <label key={o.id} htmlFor={`consent-email-${o.id}`} className="flex min-h-11 cursor-pointer items-start gap-3">
                <input
                  id={`consent-email-${o.id}`}
                  type="radio"
                  name="email-choice"
                  className="mt-1 accent-primary"
                  checked={(emailChoice ?? prompt.emailChoice ?? "primary") === o.id}
                  onChange={() => setEmailChoice(o.id)}
                />
                <span className="min-w-0">
                  <span className="block font-medium">{t(`auth.consent.email.${o.source}`)}</span>
                  <span className="block break-all text-xs text-muted-foreground">{o.email}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {prompt.richIdentity && (
          <label htmlFor="consent-rich-identity" className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-3 text-sm">
            <Checkbox
              id="consent-rich-identity"
              checked={richOptIn}
              onCheckedChange={(v) => setRichOptIn(v === true)}
              aria-label={t("auth.consent.share")}
            />
            <span>
              <span className="flex items-center gap-1.5 font-medium">
                <Eye className="h-3.5 w-3.5" aria-hidden /> {t("auth.consent.shareOptional")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("auth.consent.shareBody")}
              </span>
            </span>
          </label>
        )}

        {/* Strict: inline verificatie */}
        {needsCode && (
          <div className="mt-6 rounded-2xl border border-border bg-background/60 p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4" aria-hidden /> {t("auth.consent.extra")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("auth.consent.extraBody", { name: appName })}
            </p>
            {codeSentTo ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">{t("auth.consent.sent", { email: codeSentTo })}</p>
                <div className="flex gap-2">
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="font-mono tracking-[0.4em]"
                    aria-label={t("auth.ui.code.label")}
                  />
                  <Button onClick={confirmCode} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.confirm")}
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={requestCode}
                  className="text-xs text-muted-foreground underline"
                  disabled={busy}
                >
                  {t("auth.code.resend")}
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <Button className="w-full" onClick={confirmPasskey} disabled={busy}>
                  <KeyRound className="h-4 w-4" aria-hidden /> {t("auth.consent.passkey", { defaultValue: "Bevestig met passkey" })}
                </Button>
                <Button variant="outline" className="w-full" onClick={requestCode} disabled={busy}>
                  <Mail className="h-4 w-4" aria-hidden /> {t("auth.code.send")}
                </Button>
              </div>
            )}
            {codeError && <p className="mt-2 text-xs text-destructive">{codeError}</p>}
          </div>
        )}
        {prompt.requiresStepUp && stepUpDone && (
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5" aria-hidden /> {t("auth.consent.verified")}
          </p>
        )}

        <Button
          className="mt-6 h-12 w-full rounded-2xl text-base"
          disabled={busy || needsCode}
          onClick={() => choose(true)}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.consent.allow")}
        </Button>
        <Button
          variant="outline"
          className="mt-2 h-11 w-full rounded-2xl"
          disabled={busy}
          onClick={() => choose(false)}
        >
          {t("auth.consent.deny")}
        </Button>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {prompt.app?.privacyUrl && (
            <a href={prompt.app.privacyUrl} className="underline" rel="noreferrer noopener">
              {t("auth.consent.privacy")}
            </a>
          )}
          {prompt.app?.privacyUrl && prompt.app?.termsUrl ? " · " : ""}
          {prompt.app?.termsUrl && (
            <a href={prompt.app.termsUrl} className="underline" rel="noreferrer noopener">
              {t("auth.consent.terms")}
            </a>
          )}
        </p>
      </div>
    </main>
  );
}

