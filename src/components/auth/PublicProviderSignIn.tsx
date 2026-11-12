import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AUTH_PROVIDERS, FediverseDialog, ProviderMark, type AuthProvider } from "./ProviderKit";
import { providerAvailable } from "@/lib/auth/provider-availability";
import type { AuthReadiness } from "@/lib/auth-readiness";
import { authClient } from "@/lib/auth-client";
import { POST_AUTH_PATH } from "@/lib/auth/post-auth";

export function PublicProviderSignIn({ configured, readiness, disabled }: { configured: string[]; readiness: AuthReadiness | null; disabled: boolean }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [fediverse, setFediverse] = useState<"bluesky" | "mastodon" | null>(null);
  async function signIn(provider: AuthProvider) {
    if (!providerAvailable(provider.id, configured, readiness) || disabled || busy) return;
    if (provider.kind === "bluesky" || provider.kind === "mastodon") { setFediverse(provider.kind); return; }
    setBusy(provider.id);
    try {
      // Better Auth 1.7 registers generic OIDC providers on the same social endpoint.
      const result = await authClient.signIn.social({ provider: provider.id, callbackURL: POST_AUTH_PATH, errorCallbackURL: "/auth/sign-in?error=provider_rejected" });
      if (result.error) { toast.error(t("auth.provider.server", { name: provider.label })); return; }
      if (result.data?.url) window.location.assign(result.data.url);
      else toast.error(t("auth.provider.server", { name: provider.label }));
    } catch { toast.error(t("auth.provider.server", { name: provider.label })); }
    finally { setBusy(null); }
  }
  return <div className="space-y-2">
    {/* Mobile: compact icon row. Desktop: full labelled buttons. */}
    <div className="flex flex-wrap justify-center gap-2 md:hidden" role="group" aria-label={t("auth.provider.continue", { name: "" })}>
      {AUTH_PROVIDERS.map(provider => {
        const available = providerAvailable(provider.id, configured, readiness);
        return <Button key={provider.id} type="button" variant="outline" size="icon" aria-label={t("auth.provider.continue", { name: provider.label })}
          className={`h-11 w-11 rounded-xl ${provider.id === "google" ? "google-sign-in" : ""}`} disabled={disabled || busy !== null || !available}
          title={!available ? t("auth.provider.config", { name: provider.label }) : provider.label}
          onClick={() => void signIn(provider)}>
          {busy === provider.id ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <ProviderMark id={provider.id} />}
        </Button>;
      })}
    </div>
    <div className="hidden space-y-2 md:block">
    {AUTH_PROVIDERS.map(provider => {
      const available = providerAvailable(provider.id, configured, readiness);
      return <Button key={provider.id} type="button" variant="outline" className={`min-h-11 w-full justify-start gap-2.5 px-3 text-sm ${provider.id === "google" ? "google-sign-in" : ""}`} disabled={disabled || busy !== null || !available}
        title={!available ? t("auth.provider.config", { name: provider.label }) : undefined}
        onClick={() => void signIn(provider)}>
        {busy === provider.id ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <ProviderMark id={provider.id} />}
        <span className="min-w-0 flex-1 text-left">{t("auth.provider.continue", { name: provider.label })}</span>
      </Button>;
    })}
    </div>
    <FediverseDialog provider={fediverse} onClose={() => setFediverse(null)} next={POST_AUTH_PATH} />
  </div>;
}
