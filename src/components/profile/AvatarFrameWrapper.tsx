import { useTranslation } from "react-i18next";
import { PresenceIcon } from "@/lib/presence-icons";
import type { PresenceIndicator } from "@/lib/status-bubble";
import { useEffect, useState, type ReactNode } from "react";
import { AvatarDecorationLayer } from "@/components/profile/AvatarDecorationLayer";
import {
  presenceDef,
  type AvatarDecoration,
  type PresenceStatus,
} from "@/lib/avatar-decorations";
import {
  avatarFrameDef,
  avatarFrameFallbackStyle,
  avatarFrameStyle,
  prefersLightFrames,
  type AvatarFrame,
  type AvatarFrameOverlay,
  type FrameTheme,
} from "@/lib/avatar-frames";

/** Kleine decoratieve SVG-overlay bovenop de rand. */
function FrameOverlay({ overlay }: { overlay: AvatarFrameOverlay }) {
  if (!overlay) return null;
  const common = "pointer-events-none absolute inset-0 h-full w-full";
  switch (overlay) {
    case "laurel":
      return (
        <svg viewBox="0 0 100 100" className={common} aria-hidden>
          <g fill="none" stroke="#e8c87a" strokeWidth="2" strokeLinecap="round">
            <path d="M22 82C10 68 10 40 26 24" />
            <path d="M78 82C90 68 90 40 74 24" />
          </g>
          <g fill="#c9a84c">
            {[30, 42, 54, 66, 78].map((y, i) => (
              <g key={y}>
                <ellipse
                  cx={18 - i * 0.4}
                  cy={y}
                  rx="5"
                  ry="2.6"
                  transform={`rotate(-25 18 ${y})`}
                />
                <ellipse
                  cx={82 + i * 0.4}
                  cy={y}
                  rx="5"
                  ry="2.6"
                  transform={`rotate(25 82 ${y})`}
                />
              </g>
            ))}
          </g>
        </svg>
      );
    case "crown":
      return (
        <svg viewBox="0 0 100 100" className={common} aria-hidden>
          <path
            d="M35 12l6 8 9-11 9 11 6-8 3 12H32z"
            fill="#fcd34d"
            stroke="#b45309"
            strokeWidth="1.5"
          />
        </svg>
      );
    case "gear":
      return (
        <svg viewBox="0 0 100 100" className={common} aria-hidden>
          <g stroke="#d6b98c" strokeWidth="2" fill="none">
            <circle cx="50" cy="50" r="46" strokeDasharray="6 6" />
          </g>
        </svg>
      );
    case "chain":
      return (
        <svg viewBox="0 0 100 100" className={common} aria-hidden>
          <circle
            cx="50"
            cy="50"
            r="47"
            fill="none"
            stroke="#f4e2b0"
            strokeWidth="3"
            strokeDasharray="7 5"
            strokeLinecap="round"
            opacity="0.85"
          />
        </svg>
      );
    case "flower":
      return (
        <svg viewBox="0 0 100 100" className={common} aria-hidden>
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <g key={a} transform={`rotate(${a} 50 50)`}>
              <circle cx="50" cy="4" r="4" fill="#fbcfe8" stroke="#f472b6" strokeWidth="0.8" />
            </g>
          ))}
        </svg>
      );
    case "lace":
      return (
        <svg viewBox="0 0 100 100" className={common} aria-hidden>
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="#7f1d1d"
            strokeWidth="2"
            strokeDasharray="2 4"
          />
          <circle
            cx="50"
            cy="50"
            r="41"
            fill="none"
            stroke="#111827"
            strokeWidth="1"
            strokeDasharray="1 3"
          />
        </svg>
      );
    case "hex":
      return (
        <svg viewBox="0 0 100 100" className={common} aria-hidden>
          <polygon
            points="50,3 91,26 91,74 50,97 9,74 9,26"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="1.5"
            opacity="0.8"
          />
        </svg>
      );
    case "pixel":
      return (
        <svg viewBox="0 0 100 100" className={common} aria-hidden>
          <g fill="#0f172a">
            <rect x="0" y="0" width="10" height="10" />
            <rect x="90" y="0" width="10" height="10" />
            <rect x="0" y="90" width="10" height="10" />
            <rect x="90" y="90" width="10" height="10" />
          </g>
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Rendert de avatar binnen het gekozen kader. Wordt gebruikt in de studio
 * (kiezer + live preview) en op publieke profielen, zodat één definitie geldt.
 */
export function AvatarFrameWrapper({
  frame,
  theme,
  children,
  className = "",
  decoration = "none",
  presence = "none",
  indicator = "color",
  emoji = null,
}: {
  frame: AvatarFrame;
  theme: FrameTheme;
  children: ReactNode;
  className?: string;
  /** Discord-achtige decoratie bovenop de avatar. */
  decoration?: AvatarDecoration;
  /** Statusbolletje rechtsonder. */
  presence?: PresenceStatus;
  /** Effen kleur, kleur + icoon, of één emoji in plaats van het bolletje. */
  indicator?: PresenceIndicator;
  emoji?: string | null;
}) {
  const { t } = useTranslation();
  const def = avatarFrameDef(frame);
  // SSR rendert altijd het volledige kader; na hydratatie schakelen trage
  // toestellen (weinig cores/RAM, databesparing, verminderde beweging) over op
  // een effen rand zonder gradients, gloed of animatie.
  const [light, setLight] = useState(false);
  useEffect(() => {
    setLight(prefersLightFrames());
  }, []);

  const style = light ? avatarFrameFallbackStyle(frame, theme) : avatarFrameStyle(frame, theme);
  const status = presenceDef(presence);
  return (
    <div
      style={style}
      className={`relative inline-flex shrink-0 ${light ? "" : (def.animation ?? "")} ${className}`}
    >
      {children}
      {!light && <FrameOverlay overlay={def.overlay ?? null} />}
      {!light && <AvatarDecorationLayer decoration={decoration} />}
      {indicator === "emoji" && emoji ? (
        <span
          title={status.label}
          aria-label={status.label === "Verborgen" ? t("profile.statusLabel") : status.label}
          className="absolute bottom-0 right-0 flex h-[32%] w-[32%] min-h-5 min-w-5 items-center justify-center rounded-full leading-none [container-type:size]"
          style={{ background: theme.card, boxShadow: `0 0 0 3px ${theme.bg}` }}
        >
          <span className="text-[62cqh]" aria-hidden>{emoji}</span>
        </span>
      ) : presence !== "none" && (
        <span
          title={status.label}
          aria-label={status.label}
          className="absolute bottom-0 right-0 flex h-[26%] w-[26%] min-h-3 min-w-3 items-center justify-center rounded-full"
          style={{ background: status.color, boxShadow: `0 0 0 3px ${theme.bg}`, color: "rgba(255,255,255,0.78)" }}
        >
          {indicator === "color_with_icon" ? (
            <PresenceIcon status={presence} />
          ) : (
            <>
              {presence === "dnd" && (
                <span
                  className="absolute left-1/2 top-1/2 h-[2px] w-[55%] -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ background: theme.bg }}
                />
              )}
              {presence === "idle" && (
                <span
                  className="absolute left-[18%] top-[8%] h-[70%] w-[70%] rounded-full"
                  style={{ background: theme.bg }}
                />
              )}
            </>
          )}
        </span>
      )}
    </div>
  );
}

