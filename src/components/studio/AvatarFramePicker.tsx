import { AvatarFrameWrapper } from "@/components/profile/AvatarFrameWrapper";
import { DecorGrid } from "@/components/studio/DecorGrid";
import {
  AVATAR_FRAME_CATEGORIES,
  AVATAR_FRAME_DEFS,
  POPULAR_FRAMES,
  type AvatarFrame,
  type FrameTheme,
} from "@/lib/avatar-frames";

/** Doorzoekbare kiezer met 100+ avatarkaders, favorieten en populaire keuzes. */
export function AvatarFramePicker({
  value,
  onChange,
  avatarUrl,
  theme,
}: {
  value: AvatarFrame;
  onChange: (frame: AvatarFrame) => void;
  avatarUrl: string;
  theme: FrameTheme;
}) {
  return (
    <DecorGrid
      items={AVATAR_FRAME_DEFS}
      categories={AVATAR_FRAME_CATEGORIES}
      popular={POPULAR_FRAMES}
      value={value}
      onChange={(id) => onChange(id as AvatarFrame)}
      favKey="rout:fav-frames"
      renderPreview={(id) => (
        <AvatarFrameWrapper frame={id as AvatarFrame} theme={theme}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" aria-hidden />
          ) : (
            <span className="block h-10 w-10 rounded-full" style={{ background: theme.card }} aria-hidden />
          )}
        </AvatarFrameWrapper>
      )}
    />
  );
}
