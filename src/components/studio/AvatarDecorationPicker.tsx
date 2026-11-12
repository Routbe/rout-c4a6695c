import { cn } from "@/lib/utils";
import { DecorGrid } from "@/components/studio/DecorGrid";
import { AvatarFrameWrapper } from "@/components/profile/AvatarFrameWrapper";
import {
  AVATAR_DECORATION_DEFS,
  DECORATION_CATEGORIES,
  PRESENCE_DEFS,
  type AvatarDecoration,
  type PresenceStatus,
} from "@/lib/avatar-decorations";
import type { AvatarFrame, FrameTheme } from "@/lib/avatar-frames";

/**
 * Discord-achtige avatardecoraties + aanwezigheidsstatus, met live voorbeeld
 * bovenop het gekozen kader.
 */
export function AvatarDecorationPicker({
  value,
  onChange,
  presence,
  onPresenceChange,
  avatarUrl,
  frame,
  theme,
}: {
  value: AvatarDecoration;
  onChange: (next: AvatarDecoration) => void;
  /** @deprecated status lives in the Links tab now; kept optional for old callers. */
  presence?: PresenceStatus;
  onPresenceChange?: (next: PresenceStatus) => void;
  avatarUrl: string;
  frame: AvatarFrame;
  theme: FrameTheme;
}) {
  return (
    <div className="space-y-3">
      <DecorGrid
        items={AVATAR_DECORATION_DEFS}
        categories={DECORATION_CATEGORIES}
        popular={["cat_ears", "royal_crown", "gamer_wings", "magic_runes", "cloud_rainbow", "sakura_branch"]}
        value={value}
        onChange={(id) => onChange(id as AvatarDecoration)}
        favKey="rout:fav-decor"
        renderPreview={(id) => (
          <AvatarFrameWrapper frame={frame} theme={theme} decoration={id as AvatarDecoration}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" aria-hidden />
            ) : (
              <span className="block h-10 w-10 rounded-full" style={{ background: theme.card }} aria-hidden />
            )}
          </AvatarFrameWrapper>
        )}
      />

      {onPresenceChange && presence !== undefined && (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="input-label">Status indicator</p>
          <div className="flex flex-wrap gap-2">
            {PRESENCE_DEFS.map((p) => (
              <button key={p.id} type="button" onClick={() => onPresenceChange(p.id)} aria-pressed={presence === p.id} className={cn("h-9 rounded-full border px-3 text-[11px]", presence === p.id ? "border-primary/50 bg-primary/10" : "border-border")}>{p.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
