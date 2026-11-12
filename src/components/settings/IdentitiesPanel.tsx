import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { authClient } from "@/lib/auth-client";
import { getMyIdentities, unlinkMyIdentity } from "@/lib/identities.functions";
import type { IdentityRow } from "@/lib/identities.server";
import { EMAIL_TRUST_LABEL, emailTrust } from "@/lib/email-trust";
import { AUTH_PROVIDERS, FediverseDialog, ProviderMark, type AuthProvider } from "@/components/auth/ProviderKit";

const RETURN_PATH = "/studio/account?tab=identities";

/** Tab 3 — link and manage every external identity from one list. */
export function IdentitiesPanel() {
  const { t } = useI18n();
  const [identities, setIdentities] = useState<IdentityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [fediverse, setFediverse] = useState<"bluesky" | "mastodon" | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getMyIdentities();
      setIdentities(result.identities);
    } catch {
      /* the panel simply shows every provider as not connected */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const params = new URLSearchParams(window.location.search);
    const linked = params.get("linked");
    if (linked) toast.success(t("auth.settings.identities.linked", { name: AUTH_PROVIDERS.find((p) => p.id === linked)?.label ?? linked }));
    if (params.get("link_error") === "taken") toast.error(t("auth.settings.identities.taken"));
    const error = params.get("error");
    if (error) toast.error(t("auth.settings.identities.failed"));
    if (linked || params.get("link_error") || error) {
      params.delete("linked");
      params.delete("link_error");
      params.delete("error");
      const qs = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }
  }, [load]);

  const connect = async (provider: AuthProvider) => {
    if (provider.kind === "bluesky" || provider.kind === "mastodon") {
      setFediverse(provider.kind);
      return;
    }
    setBusy(provider.id);
    try {
      const callbackURL = `${RETURN_PATH}&linked=${provider.id}`;
      const errorCallbackURL = RETURN_PATH;
      const client = authClient as unknown as {
        linkSocial: (o: object) => Promise<{ data?: { url?: string }; error?: { message?: string; status?: number } }>;
        oauth2: { link: (o: object) => Promise<{ data?: { url?: string }; error?: { message?: string; status?: number } }> };
      };
      const result =
        provider.kind === "social"
          ? await client.linkSocial({ provider: provider.id, callbackURL, errorCallbackURL })
          : await client.oauth2.link({ providerId: provider.id, callbackURL, errorCallbackURL });
      if (result?.error) {
        toast.error(
          result.error.status === 400 || result.error.status === 404
            ? t("auth.settings.identities.inactive", { name: provider.label })
            : result.error.message || t("auth.settings.identities.failedShort"),
        );
        return;
      }
      const url = result?.data?.url;
      if (url) {
        window.location.assign(url);
        return;
      }
      // Never fail silently: no error and no URL means the server returned nothing usable.
      console.error(`[identities] ${provider.id} link returned no authorization URL`, result);
      toast.error(t("auth.settings.identities.urlFailed", { name: provider.label }));
    } catch (error) {
      console.error(`[identities] ${provider.id} link failed`, error);
      toast.error(t("auth.settings.identities.providerFailed", { name: provider.label }));
    } finally {
      setBusy(null);
    }
  };

  const unlink = async (identityId: string) => {
    const result = await unlinkMyIdentity({ data: { identityId } });
    if (!result.ok) {
      toast.error(t("auth.settings.identities.notFound"));
      return;
    }
    toast.success(t("oauth.unlink"));
    void load();
  };

  const onlyMethod = false; // identities are proofs, never the way in (passkey-only)

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-medium">{t("oauth.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("auth.settings.identities.description")}
        </p>
      </div>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border">
          {AUTH_PROVIDERS.map((provider) => {
            const linked = identities.filter((i) => i.provider === provider.id);
            return (
              <li key={provider.id} className="flex flex-col gap-2 p-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/60">
                    <ProviderMark id={provider.id} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-foreground">{provider.label}</span>
                  <Button variant="outline" size="sm" disabled={busy === provider.id} onClick={() => connect(provider)}>
                    {busy === provider.id ? <Loader2 className="h-4 w-4 animate-spin" /> : linked.length ? t("auth.settings.identities.another") : t("auth.settings.identities.connect")}
                  </Button>
                </div>
                {linked.map((identity) => (
                  <div key={identity.id} className="ml-11 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {t("auth.settings.identities.as", { name: identity.displayName ?? identity.email ?? provider.label })}
                    </span>
                    {(() => {
                      const level = emailTrust({ email: identity.email, emailVerified: true, verifiedBy: [identity.provider] });
                      return level === "sovereign" || level === "provider" ? (
                        <span className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {EMAIL_TRUST_LABEL[level]}
                        </span>
                      ) : null;
                    })()}
                    <Button variant="ghost" size="sm" disabled={onlyMethod} onClick={() => unlink(identity.id)}>
                      {t("oauth.unlink")}
                    </Button>
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
      )}

      <FediverseDialog provider={fediverse} onClose={() => setFediverse(null)} link next={RETURN_PATH} />
    </section>
  );
}
