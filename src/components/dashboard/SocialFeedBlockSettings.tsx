import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { parseSocialFeedConfig, serializeSocialFeedConfig, SOCIAL_FEED_MAX_COLUMNS, SOCIAL_FEED_MAX_COUNT, type SocialFeedConfig } from "@/lib/social-feed";

const chip = (on: boolean) =>
  `rounded-lg border px-2 py-1.5 text-[11px] font-medium ${on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted"}`;

/** Studio panel for the automatic Bluesky/Mastodon post feed. */
export function SocialFeedBlockSettings({ value, onChange, onTitle }: { value: string; onChange: (v: string) => void; onTitle: (l: string) => void }) {
  const { t } = useTranslation();
  const c = parseSocialFeedConfig(value);
  const update = (patch: Partial<SocialFeedConfig>) => {
    const next = { ...c, ...patch };
    onChange(serializeSocialFeedConfig(next));
    onTitle(`${next.platform === "bluesky" ? "Bluesky" : "Mastodon"}-posts`);
  };
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-background p-3">
      <p className="text-[11px] font-medium text-foreground">Automatische posts</p>
      <div className="grid grid-cols-2 gap-1.5">
        {(["bluesky", "mastodon"] as const).map((p) => (
          <button key={p} type="button" className={chip(c.platform === p)} onClick={() => update({ platform: p })}>{p === "bluesky" ? "Bluesky" : "Mastodon"}</button>
        ))}
        {["Instagram", "TikTok", "Threads", "X"].map((name) => (
          <button key={name} type="button" disabled className={`${chip(false)} cursor-not-allowed opacity-50`} title={t("studio.socialFeed.soon")}>
            {name} · {t("studio.socialFeed.soon")}
          </button>
        ))}
      </div>
      <Input
        className="input-field h-9 rounded-xl"
        placeholder={c.platform === "bluesky" ? "jouwnaam.bsky.social" : "jouwnaam@mastodon.social"}
        value={c.handle}
        onChange={(e) => update({ handle: e.target.value })}
        aria-label="Account"
      />
      <label className="block space-y-1 text-[11px] text-muted-foreground">
        Aantal posts: {c.count}
        <input type="range" min={1} max={SOCIAL_FEED_MAX_COUNT} value={c.count} onChange={(e) => update({ count: Number(e.target.value) })} className="w-full" />
      </label>
      <div className="space-y-1">
        <p className="text-[11px] text-muted-foreground">Posts naast elkaar</p>
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: SOCIAL_FEED_MAX_COLUMNS }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" className={chip(c.columns === n)} onClick={() => update({ columns: n })}>{n}</button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-[11px] text-muted-foreground">Scrollen</p>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" className={chip(c.direction === "horizontal")} onClick={() => update({ direction: "horizontal" })}>Links → rechts</button>
          <button type="button" className={chip(c.direction === "vertical")} onClick={() => update({ direction: "vertical" })}>Naar beneden</button>
        </div>
      </div>
    </div>
  );
}
