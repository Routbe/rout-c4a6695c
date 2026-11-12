import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, Lock, ShieldCheck, X } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AvatarUpload } from "@/components/settings/AvatarUpload";
import { db } from "@/lib/db/client";
import { handleIssue, handleRuleHint, normalizeHandle } from "@/lib/profile";
import { normalizeHandleForStorage } from "@/lib/handle-rules";
import { strictHandleIssue } from "@/lib/handle-validation";
import { HandleErrorBanner } from "@/components/HandleValidationMessage";
import { useHandleAvailability } from "@/hooks/useHandleAvailability";
import { styledProfilePath } from "@/lib/profile-url";
import { useUrlStyle } from "@/hooks/useUrlStyle";
import { verifiedHandleSuggestionList as verifiedHandleSuggestions } from "@/lib/verified-handle";

import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { selectTolerant } from "@/lib/optional-columns";

interface ProfileForm {
  username: string;
  display_name: string;
  tagline: string;
  bio: string;
  avatar_url: string;
}

interface ShowcaseRow {
  id: string;
  handle: string;
  display_name: string;
  tagline: string;
  link_count: number;
  verified: boolean;
}

interface ReservedRow {
  handle: string;
  label: string | null;
  reason: string;
}

const EMPTY: ProfileForm = {
  username: "",
  display_name: "",
  tagline: "",
  bio: "",
  avatar_url: "",
};

/** Flat panel: solid surface, single hairline border, no shadow, no gradient. */
function Panel({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border border-border bg-card p-4 sm:p-5", className)}>
      <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium uppercase tracking-wide">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/**
 * /dashboard/profile — minimal profile management. Reads and writes the
 * caller's own `profiles` row only; RLS enforces that server-side, so no
 * user id is trusted from the client beyond the authenticated session.
 */
export default function ProfileSettings() {
  const { user, loading } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { t } = useI18n();

  const [form, setForm] = useState<ProfileForm>(EMPTY);
  const [initial, setInitial] = useState<ProfileForm>(EMPTY);
  const [verified, setVerified] = useState(false);
  const [legalName, setLegalName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [showcase, setShowcase] = useState<ShowcaseRow[]>([]);
  const [reserved, setReserved] = useState<ReservedRow[]>([]);
  const { style: urlStyle } = useUrlStyle();

  /** Toegestane gebruikersnaam-vormen die herleidbaar blijven naar de echte naam. */
  const nameOptions = useMemo(() => verifiedHandleSuggestions(legalName), [legalName]);

  /** Live beschikbaarheid per voorgestelde handle (max 12 tegelijk). */
  const [optionStatus, setOptionStatus] = useState<Record<string, "checking" | "free" | "taken">>(
    {},
  );
  useEffect(() => {
    if (nameOptions.length === 0) return;
    let alive = true;
    const options = nameOptions.slice(0, 12);
    setOptionStatus(Object.fromEntries(options.map((o) => [o, "checking" as const])));
    void (async () => {
      for (const option of options) {
        try {
          const res = await fetch(
            `/api/profiles/check-handle?handle=${encodeURIComponent(option)}`,
            { headers: { accept: "application/json" } },
          );
          const json = (await res.json()) as { available?: boolean };
          if (!alive) return;
          setOptionStatus((prev) => ({ ...prev, [option]: json.available ? "free" : "taken" }));
        } catch {
          if (!alive) return;
          setOptionStatus((prev) => ({ ...prev, [option]: "taken" }));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [nameOptions]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const [{ data: profile }, { data: demo }, { data: res }] = await Promise.all([
        selectTolerant(
          "username, display_name, tagline, bio, avatar_url, verified, verified_legal_name",
          (cols) => db.from("profiles").select(cols).eq("id", user.id).maybeSingle() as never,
        ) as unknown as Promise<{
          data: {
            username?: string | null;
            display_name?: string | null;
            tagline?: string | null;
            bio?: string | null;
            avatar_url?: string | null;
            verified?: boolean | null;
            verified_legal_name?: string | null;
          } | null;
        }>,
        db
          .from("showcase_profiles")
          .select("id, handle, display_name, tagline, link_count, verified")
          .order("sort_order", { ascending: true }),
        db.from("reserved_handles").select("handle, label, reason").order("handle"),
      ]);
      if (!alive) return;
      const next: ProfileForm = {
        username: profile?.username ?? "",
        display_name: profile?.display_name ?? "",
        tagline: profile?.tagline ?? "",
        bio: profile?.bio ?? "",
        avatar_url: profile?.avatar_url ?? "",
      };
      setForm(next);
      setInitial(next);
      setVerified(Boolean(profile?.verified));
      setLegalName(
        ((profile as { verified_legal_name?: string | null } | null)?.verified_legal_name ??
          null) ||
          null,
      );
      setShowcase((demo ?? []) as ShowcaseRow[]);
      setReserved((res ?? []) as ReservedRow[]);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const handleCtx = useMemo(
    () => ({ tier: (verified ? "verified" : "free") as "verified" | "free", legalName }),
    [verified, legalName],
  );
  const strictIssue = strictHandleIssue(form.username);
  const handleError = useMemo(
    () => (form.username ? handleIssue(normalizeHandle(form.username), handleCtx) : null),
    [form.username, handleCtx],
  );
  // Real-time beschikbaarheid, 300 ms gedebounced tegen /api/profiles/check-handle.
  // Staat vóór alle early returns: hooks mogen niet conditioneel lopen.
  const availability = useHandleAvailability(form.username, Boolean(handleError));
  const dirty = useMemo(
    () => (Object.keys(form) as (keyof ProfileForm)[]).some((k) => form[k] !== initial[k]),
    [form, initial],
  );

  const set = (key: keyof ProfileForm, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    if (!user || handleError || strictIssue) return;
    setBusy(true);
    const payload = {
      username: normalizeHandle(form.username) || null,
      display_name: form.display_name.trim() || null,
      tagline: form.tagline.trim() || null,
      bio: form.bio.trim() || null,
      avatar_url: form.avatar_url.trim() || null,
    };
    const { error } = await db.from("profiles").update(payload).eq("id", user.id);
    setBusy(false);
    if (error) {
      toast.error(
        error.message.includes("duplicate") || error.message.includes("unique")
          ? t("studio.profileSettings.taken")
          : error.message,
      );
      return;
    }
    setInitial({ ...form, username: payload.username ?? "" });
    setForm((f) => ({ ...f, username: payload.username ?? "" }));
    toast.success(t("studio.profileSettings.saved"));
  }

  if (loading || !user || !ready) {
    return (
      <AppLayout title={t("studio.profileSettings.title")}>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const publicPath = form.username
    ? styledProfilePath(normalizeHandle(form.username), urlStyle)
    : null;

  return (
    <AppLayout
      title={t("studio.profileSettings.title")}
      description={t("studio.page.description")}
      crumbs={[{ label: t("studio.dashboard.title"), to: "/dashboard" }, { label: t("studio.profileSettings.title") }]}
      actions={
        publicPath ? (
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <a href={publicPath} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> {t("studio.editor.view")}
            </a>
          </Button>
        ) : null
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Panel
            title={t("studio.profileSettings.identity")}
            hint={t("studio.profileSettings.identityHelp")}
          >
            <div className="space-y-4">
              <Field label={t("studio.profileSettings.handle")} htmlFor="handle" error={handleError}>
                <div className="flex items-stretch">
                  <span className="flex select-none items-center border border-r-0 border-border bg-muted px-3 text-sm text-muted-foreground">
                    {`rout.be${styledProfilePath("", urlStyle)}`}
                  </span>
                  <Input
                    id="handle"
                    value={form.username}
                    onChange={(e) => set("username", normalizeHandleForStorage(e.target.value))}
                    className="rounded-none"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                {availability.state === "checking" && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> {t("handle.checking")}
                  </p>
                )}
                {availability.state === "available" && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" aria-hidden /> {t("handle.available")}
                  </p>
                )}
                {availability.state === "taken" && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <X className="h-3 w-3" aria-hidden />{" "}
                    {availability.reason === "reserved" ? t("handle.reserved") : t("handle.taken")}
                  </p>
                )}
                {strictIssue && <HandleErrorBanner message={strictIssue} className="mt-2" />}
                {!strictIssue && handleError && (
                  <p className="text-xs font-medium text-destructive">{t("handle.invalid")}</p>
                )}

                <p className="text-xs text-muted-foreground">{handleRuleHint(handleCtx)}</p>
              </Field>

              <Field label={t("studio.profileSettings.name")} htmlFor="display_name">
                <Input
                  id="display_name"
                  value={form.display_name}
                  onChange={(e) => set("display_name", e.target.value)}
                  className="rounded-none"
                  placeholder="Studio Noir"
                />
              </Field>

              <Field label={t("studio.profileSettings.tagline")} htmlFor="tagline">
                <Input
                  id="tagline"
                  value={form.tagline}
                  onChange={(e) => set("tagline", e.target.value)}
                  className="rounded-none"
                  placeholder={t("studio.profileSettings.taglinePlaceholder")}
                />
              </Field>

              <Field label={t("studio.profileSettings.bio")} htmlFor="bio">
                <Textarea
                  id="bio"
                  value={form.bio}
                  onChange={(e) => set("bio", e.target.value)}
                  rows={4}
                  className="rounded-none"
                  placeholder={t("studio.profileSettings.bioPlaceholder")}
                />
              </Field>

              <Field label={t("studio.profileSettings.avatar")}>
                <AvatarUpload
                  value={form.avatar_url.trim() || null}
                  name={form.display_name || form.username}
                  onChange={(url) => set("avatar_url", url ?? "")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("studio.profileSettings.avatarHelp")}
                </p>
              </Field>

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Button
                  onClick={save}
                  disabled={
                    busy ||
                    !dirty ||
                    Boolean(handleError) ||
                    Boolean(strictIssue) ||
                    availability.state === "taken"
                  }
                  className="gap-1.5 rounded-none"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {t("studio.profileSettings.save")}
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-none"
                  disabled={!dirty || busy}
                  onClick={() => setForm(initial)}
                >
                  {t("studio.profileSettings.reset")}
                </Button>
                <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  {isAdmin ? (
                    <>
                      <ShieldCheck className="h-3.5 w-3.5" /> {t("studio.profileSettings.admin")}
                    </>
                  ) : (
                    <>{t("studio.profileSettings.user")}</>
                  )}
                </span>
              </div>
            </div>
          </Panel>

          <Panel
            title={t("studio.profileSettings.choose")}
            hint={
              verified
                ? t("studio.profileSettings.verifiedHelp")
                : t("studio.profileSettings.verifyHelp")
            }
          >
            <div className="space-y-3">
              {nameOptions.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {nameOptions.map((option) => {
                    const active = normalizeHandle(form.username) === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={optionStatus[option] === "taken"}
                        onClick={() => set("username", option)}
                        aria-pressed={active}
                        className={cn(
                          "flex items-center justify-between gap-2 border px-3 py-2.5 text-left transition-colors",
                          active
                            ? "border-foreground bg-accent text-accent-foreground"
                            : "border-border bg-background hover:bg-muted",
                        )}
                      >
                        <span className="truncate font-mono text-xs">rout.be/{option}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {optionStatus[option] === "free"
                              ? t("studio.profileSettings.free")
                              : optionStatus[option] === "taken"
                                ? t("studio.profileSettings.occupied")
                                : "…"}
                          </span>
                          {active ? <Check className="h-4 w-4" /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("studio.profileSettings.suggestions")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t("studio.profileSettings.nameHelp")}{" "}
                <span className="font-mono">
                  rout.be/{normalizeHandle(form.username) || "handle"}
                </span>{" "}
                {t("studio.profileSettings.and")}{" "}
                <span className="font-mono">
                  rout.be/u/{normalizeHandle(form.username) || "handle"}
                </span>{" "}
                {t("studio.profileSettings.urls")}{" "}
                <Link to="/verify" className="underline">
                  {t("studio.profileSettings.learn")}
                </Link>
                .
              </p>
            </div>
          </Panel>

          <Panel title={t("studio.profileSettings.examples")} hint={t("studio.profileSettings.examplesHint")}>
            <ul className="divide-y divide-border border border-border">
              {showcase.map((row) => (
                <li
                  key={row.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-background p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {row.display_name}
                      {row.verified ? (
                        <span className="ml-2 inline-block bg-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent-foreground">
                          {t("studio.profileSettings.verified")}
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      @{row.handle} · {row.tagline}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {row.link_count} links
                  </span>
                </li>
              ))}
              {showcase.length === 0 ? (
                <li className="bg-background p-3 text-xs text-muted-foreground">
                  {t("studio.profileSettings.empty")}
                </li>
              ) : null}
            </ul>
          </Panel>
        </div>

        <Panel
          title={t("studio.profileSettings.reserved")}
          hint={t("studio.profileSettings.reservedHelp")}
          className="h-fit"
        >
          <ul className="flex flex-wrap gap-1.5">
            {reserved.map((row) => (
              <li
                key={row.handle}
                title={row.label ?? row.reason}
                className="inline-flex items-center gap-1 border border-border bg-muted px-2 py-1 text-xs text-muted-foreground"
              >
                <Lock className="h-3 w-3" />@{row.handle}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            {t("studio.profileSettings.contactHelp")}{" "}
            <Link to="/contact" className="underline underline-offset-2">
              {t("studio.profileSettings.contact")}
            </Link>
            .
          </p>
        </Panel>
      </div>
    </AppLayout>
  );
}
