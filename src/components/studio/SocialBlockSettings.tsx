import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { Switch } from "@/components/ui/switch";
import { getSocialBlockStatus, toggleSocialBlockFollowers } from "@/lib/social-block.functions";
import { saveSocialLink, verifySocialOwnership } from "@/lib/social-verify.functions";
import { isSocialPlatform } from "@/lib/social-verify";
import { authClient } from "@/lib/auth-client";

export function SocialBlockSettings({ platform, handle }: { platform: string; handle: string }) {
  const { t } = useI18n();
  const statusFn = useServerFn(getSocialBlockStatus);
  const toggle = useServerFn(toggleSocialBlockFollowers);
  const save = useServerFn(saveSocialLink);
  const verify = useServerFn(verifySocialOwnership);
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: ["social-block-status", platform, handle], queryFn: () => statusFn({ data: { platform, handle } }), enabled: !!handle.trim(), retry: false });
  const official = ["github", "gitlab", "bluesky", "wsocial", "mastodon"].includes(platform);
  const available = official || isSocialPlatform(platform) || platform === "snapchat";
  const connect = async () => {
    setBusy(true);
    try {
      const next = window.location.pathname + window.location.search;
      if (platform === "youtube" || platform === "snapchat") {
        window.location.assign(`/api/${platform}/start?next=${encodeURIComponent(next)}`);
      } else if (platform === "bluesky" || platform === "wsocial") {
        window.location.assign(`/api/public/bluesky/start?handle=${encodeURIComponent(handle.replace(/^@/, ""))}&next=${encodeURIComponent(next)}&link=1`);
      } else if (platform === "mastodon") {
        window.location.assign(`/api/public/mastodon/start?instance=${encodeURIComponent(handle.replace(/^@/, "").split("@")[1] || "mastodon.social")}&next=${encodeURIComponent(next)}&link=1`);
      } else if (platform === "github" || platform === "gitlab") {
        const result = await authClient.linkSocial({ provider: platform, callbackURL: next });
        if (result.error) throw new Error("link_failed");
        if (result.data?.url) window.location.assign(result.data.url);
      } else {
        const result = await save({ data: { platform, username: handle } });
        if (!result.ok || !result.link) throw new Error("save_failed");
        const checked = await verify({ data: { id: result.link.id } });
        if (!checked.ok) throw new Error("verify_failed");
        await status.refetch();
      }
    } catch { toast.error(t("socialBlock.failed")); }
    finally { setBusy(false); }
  };
  return <div className="space-y-2">
    {status.data?.verified && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><BadgeCheck className="h-4 w-4" />{t("socialBlock.verified")}</span>}
    <details className="rounded-xl border border-border p-3 text-xs">
      <summary className="cursor-pointer font-medium">{t("socialBlock.settings")}</summary>
      <div className="mt-3 space-y-3">
        {available ? <>
          {!official && platform !== "youtube" && platform !== "snapchat" && <p className="text-muted-foreground">{t("socialBlock.bioHint")}</p>}
          {platform === "snapchat" && <p className="text-muted-foreground">{t("socialBlock.snapHint")}</p>}
          <button type="button" className="rounded-lg border px-3 py-2 disabled:opacity-50" disabled={busy || !handle.trim()} onClick={() => void connect()}>{t("socialBlock.connect")}</button>
        </> : <p className="text-muted-foreground">{t("socialBlock.unavailable")}</p>}
        <label className="flex items-center justify-between gap-3">
          {t("socialBlock.followers")}
          <Switch checked={!!status.data?.verified && !!status.data?.showFollowers} disabled={!status.data?.verified || busy} onCheckedChange={async enabled => {
            setBusy(true);
            try { await toggle({ data: { platform, handle, enabled } }); await status.refetch(); }
            catch { toast.error(t("socialBlock.failed")); }
            finally { setBusy(false); }
          }} />
        </label>
      </div>
    </details>
  </div>;
}
