import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const OFFICIAL = ["bluesky", "wsocial", "mastodon", "github", "gitlab"] as const;
type Official = (typeof OFFICIAL)[number];

export function hasOfficialVerify(provider: string): provider is Official {
  return (OFFICIAL as readonly string[]).includes(provider);
}

/** Opens the service's own sign-in in "link" mode; the server then proves the handle. */
export function OfficialVerifyButton({ provider, handle, label }: { provider: string; handle: string; label: string }) {
  const [busy, setBusy] = useState(false);
  if (!hasOfficialVerify(provider)) return null;
  const next = window.location.pathname + window.location.search;

  const go = async () => {
    setBusy(true);
    const clean = handle.replace(/^@/, "");
    if (provider === "bluesky" || provider === "wsocial") {
      window.location.href = `/api/public/bluesky/start?handle=${encodeURIComponent(clean)}&next=${encodeURIComponent(next)}&link=1`;
      return;
    }
    if (provider === "mastodon") {
      const instance = clean.split("@")[1] ?? "mastodon.social";
      window.location.href = `/api/public/mastodon/start?instance=${encodeURIComponent(instance)}&next=${encodeURIComponent(next)}&link=1`;
      return;
    }
    try {
      const client = authClient as unknown as {
        linkSocial: (o: object) => Promise<{ data?: { url?: string }; error?: { message?: string; status?: number } }>;
      };
      const r = await client.linkSocial({ provider, callbackURL: next, errorCallbackURL: next });
      if (r?.error) throw new Error(r.error.status === 400 || r.error.status === 404 ? `${label}-login is nog niet actief.` : r.error.message || "Verifiëren mislukt");
      if (r?.data?.url) window.location.assign(r.data.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verifiëren mislukt");
      setBusy(false);
    }
  };

  return (
    <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void go()} className="gap-1.5">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
      Verifiëren via officiële {label}-login
    </Button>
  );
}
