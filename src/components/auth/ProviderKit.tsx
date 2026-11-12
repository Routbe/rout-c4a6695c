import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { InfomaniakMark } from "@/components/InfomaniakMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BRAND_ICONS } from "@/utils/brandIcons";
import { BLUESKY_SUFFIXES, normalizeBlueskyHandle, withBlueskySuffix } from "@/lib/bluesky-handle";
import { filterMastodonServers } from "@/lib/mastodon-servers";
import { normalizeInstance } from "@/lib/mastodon-instance";

/** How a provider starts: Better Auth social, Better Auth generic OAuth, or our own fediverse flows. */
export type ProviderKind = "social" | "generic" | "bluesky" | "mastodon";

export interface AuthProvider {
  id: string;
  label: string;
  kind: ProviderKind;
}

/** Single source for the sign-in grid and the Linked identities list. */
export const AUTH_PROVIDERS: AuthProvider[] = [
  { id: "google", label: "Google", kind: "social" },
  { id: "github", label: "GitHub", kind: "social" },
  { id: "gitlab", label: "GitLab", kind: "social" },
  { id: "mastodon", label: "Mastodon / Fediverse", kind: "mastodon" },
  { id: "bluesky", label: "Bluesky", kind: "bluesky" },
  { id: "oidc", label: "ROUT ID", kind: "generic" },
  { id: "infomaniak", label: "Infomaniak", kind: "generic" },
];

/** Providers whose availability depends on server keys (fediverse flows need none). */
export const KEYED_PROVIDERS = new Set(["google", "github", "gitlab", "apple", "oidc", "infomaniak"]);

/** Official multi-colour Google "G" — required by Google Identity branding. */
function GoogleColorMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
  );
}

const ICON_KEY: Record<string, string> = { oidc: "keycloak" };

export function ProviderMark({ id, className = "h-[18px] w-[18px] shrink-0" }: { id: string; className?: string }) {
  if (id === "google") return <GoogleColorMark className={className} />;
  if (id === "infomaniak") return <InfomaniakMark className={className} />;
  const icon = BRAND_ICONS[ICON_KEY[id] ?? id];
  if (!icon) return null;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" style={{ color: icon.color }} aria-hidden>
      <path d={icon.path} />
    </svg>
  );
}

const chip =
  "rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground";

/**
 * Popup asking for a Bluesky handle or a Mastodon server, then starting the
 * existing flow. `link` attaches the account to the signed-in member instead
 * of signing in.
 */
export function FediverseDialog({
  provider,
  onClose,
  link = false,
  next = "/dashboard",
}: {
  provider: "bluesky" | "mastodon" | null;
  onClose: () => void;
  link?: boolean;
  next?: string;
}) {
  const [value, setValue] = useState("");
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [remote, setRemote] = useState<string[]>([]);

  useEffect(() => {
    setValue("");
    setBusy(false);
  }, [provider]);

  useEffect(() => {
    if (provider !== "mastodon") return;
    const q = value.trim();
    const timer = setTimeout(() => {
      fetch(`/api/public/mastodon/servers?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { servers: [] }))
        .then((b: { servers?: string[] }) => setRemote(b.servers ?? []))
        .catch(() => setRemote([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [provider, value]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const linkParam = link ? "&link=1" : "";
    if (provider === "bluesky") {
      const handle = normalizeBlueskyHandle(value);
      if (!handle) {
        toast.error(t("auth.fedi.blueskyError"));
        return;
      }
      setBusy(true);
      window.location.href = `/api/public/bluesky/start?handle=${encodeURIComponent(handle)}&next=${encodeURIComponent(next)}${linkParam}`;
    } else if (provider === "mastodon") {
      const instance = normalizeInstance(value);
      if (!instance) {
        toast.error(t("auth.fedi.serverError"));
        return;
      }
      setBusy(true);
      window.location.href = `/api/public/mastodon/start?instance=${encodeURIComponent(instance)}&next=${encodeURIComponent(next)}${linkParam}`;
    }
  };

  const isBluesky = provider === "bluesky";
  return (
    <Dialog open={provider !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {provider && <ProviderMark id={provider} />}
            {isBluesky ? "Bluesky" : "Mastodon / Fediverse"}
          </DialogTitle>
          <DialogDescription>
            {isBluesky ? t("auth.fedi.blueskyPrompt") : t("auth.fedi.serverPrompt")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={isBluesky ? "jona.bsky.social" : "mastodon.social"}
              aria-label={isBluesky ? t("auth.fedi.handle") : t("auth.fedi.server")}
              autoComplete={isBluesky ? "username" : "off"}
              className="h-10 rounded-lg"
            />
            <Button type="submit" className="h-10 rounded-lg" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : t("auth.continue")}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {isBluesky
              ? BLUESKY_SUFFIXES.map((suffix) => (
                  <button key={suffix} type="button" className={chip} onClick={() => setValue(withBlueskySuffix(value, suffix))}>
                    .{suffix}
                  </button>
                ))
              : filterMastodonServers(value, remote).map((host) => (
                  <button key={host} type="button" className={chip} onClick={() => setValue(host)}>
                    {host}
                  </button>
                ))}
          </div>
          {isBluesky && value && !value.includes(".") && (
            <p className="text-[11px] text-muted-foreground">
              {t("auth.fedi.preview")} <strong>{normalizeBlueskyHandle(value)}</strong>
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
