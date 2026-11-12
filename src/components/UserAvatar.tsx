/**
 * One avatar for every surface: the provider image when we have one
 * (Google / GitHub `avatar_url` or `picture`), a calm initials fallback
 * with a deterministic tint otherwise.
 */
export function initialsFrom(source?: string | null) {
  const clean = (source ?? "").trim().replace(/^@/, "");
  if (!clean) return "R";
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

function hueFrom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

interface Props {
  src?: string | null;
  name?: string | null;
  /** Tailwind size classes, e.g. "h-20 w-20". */
  className?: string;
  /** Text size for the fallback initials. */
  textClassName?: string;
  rounded?: string;
}

export function UserAvatar({
  src,
  name,
  className = "h-10 w-10",
  textClassName = "text-sm",
  rounded = "rounded-full",
}: Props) {
  const label = name ?? "";
  if (src) {
    return (
      <img
        src={src}
        alt={label ? `${label} avatar` : "Avatar"}
        loading="lazy"
        className={`${className} ${rounded} shrink-0 border border-border/60 object-cover`}
      />
    );
  }
  const hue = hueFrom(label || "rout");
  return (
    <span
      aria-hidden
      className={`${className} ${rounded} ${textClassName} flex shrink-0 select-none items-center justify-center border border-border/60 font-medium tracking-tight`}
      style={{
        background: `oklch(0.32 0.06 ${hue})`,
        color: `oklch(0.96 0.02 ${hue})`,
      }}
    >
      {initialsFrom(label)}
    </span>
  );
}
