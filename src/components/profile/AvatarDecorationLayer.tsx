import { avatarDecorationDef, type AvatarDecoration } from "@/lib/avatar-decorations";

/**
 * Decoratieve SVG-laag bovenop de avatar (kattenoortjes, halo, koptelefoon …).
 *
 * Alles wordt getekend in een 100×100-veld waarin de avatar de cirkel
 * (50,50 r=50) is. De svg mag buiten dat veld tekenen (`overflow: visible`),
 * zodat oortjes en hoedjes boven de avatar uitsteken.
 */
export function AvatarDecorationLayer({ decoration }: { decoration: AvatarDecoration }) {
  if (decoration === "none") return null;
  const def = avatarDecorationDef(decoration);
  const cls = `pointer-events-none absolute inset-0 h-full w-full ${def.animation ?? ""}`;
  const svg = (children: React.ReactNode) => (
    <svg viewBox="0 0 100 100" className={cls} style={{ overflow: "visible" }} aria-hidden>
      {children}
    </svg>
  );

  switch (decoration) {
    case "cat_ears":
      return svg(
        <g>
          <path d="M12 22 L18 -10 L44 8 Z" fill="#1f2937" />
          <path d="M88 22 L82 -10 L56 8 Z" fill="#1f2937" />
          <path d="M19 18 L22 0 L37 10 Z" fill="#f9a8d4" />
          <path d="M81 18 L78 0 L63 10 Z" fill="#f9a8d4" />
        </g>,
      );
    case "bunny_ears":
      return svg(
        <g>
          <ellipse cx="34" cy="-12" rx="9" ry="26" fill="#f8fafc" transform="rotate(-12 34 -12)" />
          <ellipse cx="66" cy="-12" rx="9" ry="26" fill="#f8fafc" transform="rotate(12 66 -12)" />
          <ellipse cx="34" cy="-10" rx="4" ry="18" fill="#fbcfe8" transform="rotate(-12 34 -10)" />
          <ellipse cx="66" cy="-10" rx="4" ry="18" fill="#fbcfe8" transform="rotate(12 66 -10)" />
        </g>,
      );
    case "devil_horns":
      return svg(
        <g fill="#dc2626">
          <path d="M16 16 C6 4 8 -8 20 -12 C16 0 22 8 28 12 Z" />
          <path d="M84 16 C94 4 92 -8 80 -12 C84 0 78 8 72 12 Z" />
        </g>,
      );
    case "angel_halo":
      return svg(
        <g>
          <ellipse
            cx="50"
            cy="-8"
            rx="30"
            ry="9"
            fill="none"
            stroke="#fde68a"
            strokeWidth="5"
            opacity="0.95"
          />
          <ellipse cx="50" cy="-8" rx="30" ry="9" fill="none" stroke="#fffbeb" strokeWidth="1.5" />
        </g>,
      );
    case "party_hat":
      return svg(
        <g>
          <path d="M50 -26 L34 8 L66 8 Z" fill="#6366f1" />
          <path d="M50 -26 L42 -9 L55 -3 Z" fill="#a5b4fc" />
          <circle cx="50" cy="-28" r="5" fill="#f472b6" />
          {[
            [40, 0],
            [58, -4],
            [48, -14],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill="#fde68a" />
          ))}
        </g>,
      );
    case "headphones":
      return svg(
        <g>
          <path
            d="M4 52 C4 12 96 12 96 52"
            fill="none"
            stroke="#111827"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <rect x="-6" y="44" width="18" height="30" rx="8" fill="#111827" />
          <rect x="88" y="44" width="18" height="30" rx="8" fill="#111827" />
          <rect x="-2" y="48" width="10" height="22" rx="5" fill="#22d3ee" opacity="0.85" />
          <rect x="92" y="48" width="10" height="22" rx="5" fill="#22d3ee" opacity="0.85" />
        </g>,
      );
    case "cyber_visor":
      return svg(
        <g>
          <rect x="4" y="34" width="92" height="20" rx="10" fill="#0f172a" opacity="0.92" />
          <rect x="10" y="40" width="80" height="8" rx="4" fill="#22d3ee" opacity="0.8" />
          <rect x="10" y="40" width="24" height="8" rx="4" fill="#f0fdff" opacity="0.9" />
        </g>,
      );
    case "pixel_crown":
      return svg(
        <g fill="#fbbf24" stroke="#78350f" strokeWidth="1.5">
          <path d="M22 6 h10 v-10 h10 v-8 h16 v8 h10 v10 h10 v12 H22 Z" />
        </g>,
      );
    case "sakura_branch":
      return svg(
        <g>
          <path
            d="M-4 20 C20 4 46 0 74 -4"
            fill="none"
            stroke="#7c4a2d"
            strokeWidth="3"
            strokeLinecap="round"
          />
          {[
            [10, 14],
            [34, 5],
            [58, -1],
            [76, -6],
          ].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              {[0, 72, 144, 216, 288].map((a) => (
                <ellipse
                  key={a}
                  cx="0"
                  cy="-5"
                  rx="3.2"
                  ry="5"
                  fill="#fbcfe8"
                  stroke="#f472b6"
                  strokeWidth="0.6"
                  transform={`rotate(${a})`}
                />
              ))}
              <circle r="1.8" fill="#fde68a" />
            </g>
          ))}
        </g>,
      );
    case "leaf_crown":
      return svg(
        <g>
          {Array.from({ length: 11 }).map((_, i) => {
            const a = -160 + i * 14;
            return (
              <ellipse
                key={i}
                cx="50"
                cy="-4"
                rx="6"
                ry="3"
                fill={i % 2 ? "#4ade80" : "#16a34a"}
                transform={`rotate(${a} 50 50) translate(0 0) rotate(${a / 2} 50 -4)`}
              />
            );
          })}
        </g>,
      );
    case "snow_cap":
      return svg(
        <g>
          <path
            d="M6 26 C20 -2 80 -2 94 26 C74 12 26 12 6 26 Z"
            fill="#f8fafc"
            stroke="#cbd5e1"
            strokeWidth="1"
          />
          {[
            [22, 6],
            [50, -6],
            [76, 4],
            [36, -12],
            [64, -14],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2.2" fill="#e0f2fe" />
          ))}
        </g>,
      );
    case "flame_tips":
      return svg(
        <g>
          {[24, 40, 56, 72].map((x, i) => (
            <path
              key={x}
              d={`M${x} 14 C${x - 8} 0 ${x + 2} -6 ${x} -18 C${x + 10} -6 ${x + 8} 2 ${x} 14 Z`}
              fill={i % 2 ? "#f97316" : "#facc15"}
              opacity="0.92"
            />
          ))}
        </g>,
      );
    case "sparkle_dust":
      return svg(
        <g fill="#fde68a">
          {[
            [6, 20, 3],
            [92, 30, 2.4],
            [20, -4, 2.6],
            [78, -6, 3.2],
            [98, 66, 2.2],
            [2, 62, 2.6],
          ].map(([x, y, r], i) => (
            <path
              key={i}
              d={`M${x} ${y - r! * 2} L${x! + r!} ${y} L${x} ${y! + r! * 2} L${x! - r!} ${y} Z`}
            />
          ))}
        </g>,
      );
    case "star_orbit":
      return svg(
        <g className="rout-deco-orbit-inner">
          <circle
            cx="50"
            cy="50"
            r="58"
            fill="none"
            stroke="#a78bfa"
            strokeWidth="1"
            opacity="0.5"
          />
          {[0, 120, 240].map((a) => (
            <g key={a} transform={`rotate(${a} 50 50)`}>
              <path d="M50 -12 L53 -5 L60 -4 L55 1 L56 8 L50 4 L44 8 L45 1 L40 -4 L47 -5 Z" fill="#c4b5fd" />
            </g>
          ))}
        </g>,
      );
    case "ghost_pals":
      return svg(
        <g fill="#e0e7ff" opacity="0.95">
          {[
            [4, 10],
            [96, 22],
          ].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(0.9)`}>
              <path d="M-8 6 C-8 -6 8 -6 8 6 L8 12 L4 9 L0 12 L-4 9 L-8 12 Z" />
              <circle cx="-3" cy="2" r="1.4" fill="#1e293b" />
              <circle cx="3" cy="2" r="1.4" fill="#1e293b" />
            </g>
          ))}
        </g>,
      );
    case "bubble_tea":
      return svg(
        <g transform="translate(88 62)">
          <path d="M-8 -12 L8 -12 L6 14 L-6 14 Z" fill="#fde68a" opacity="0.9" />
          <rect x="-9" y="-15" width="18" height="4" rx="2" fill="#f8fafc" />
          <path d="M3 -26 L7 -13" stroke="#f472b6" strokeWidth="3" strokeLinecap="round" />
          {[
            [-3, 9],
            [1, 11],
            [4, 8],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2" fill="#3f2412" />
          ))}
        </g>,
      );
    case "bear_ears":
      return svg(<g fill="#92400e" stroke="#451a03" strokeWidth="2"><circle cx="20" cy="8" r="15" /><circle cx="80" cy="8" r="15" /><circle cx="20" cy="8" r="7" fill="#fbbf24" /><circle cx="80" cy="8" r="7" fill="#fbbf24" /></g>);
    case "fox_ears":
      return svg(<g><path d="M8 20L20-18l27 28zM92 20L80-18 53 10z" fill="#f97316" stroke="#7c2d12" strokeWidth="2" /><path d="M18 8l4-15 12 14zM82 8L78-7 66 7z" fill="#fff7ed" /></g>);
    case "frog_hat":
      return svg(<g><path d="M6 25Q50-12 94 25Q72 12 50 14T6 25" fill="#4ade80" /><circle cx="28" cy="1" r="10" fill="#4ade80" /><circle cx="72" cy="1" r="10" fill="#4ade80" /><circle cx="28" cy="0" r="3" fill="#052e16" /><circle cx="72" cy="0" r="3" fill="#052e16" /></g>);
    case "butterfly":
      return svg(<g transform="translate(90 8) rotate(12)"><ellipse cx="-7" cy="0" rx="9" ry="14" fill="#c084fc" /><ellipse cx="7" cy="0" rx="9" ry="14" fill="#f472b6" /><ellipse cx="-5" cy="15" rx="6" ry="9" fill="#818cf8" /><ellipse cx="5" cy="15" rx="6" ry="9" fill="#fb7185" /><path d="M0-8v30" stroke="#312e81" strokeWidth="3" /></g>);
    case "flower_crown":
      return svg(<g>{[20,35,50,65,80].map((x,i)=><g key={x} transform={`translate(${x} ${i%2?0:4})`}><circle r="8" fill={i%2?"#f9a8d4":"#fde68a"}/><circle r="3" fill="#fff7ed"/></g>)}</g>);
    case "cloud_rainbow":
      return svg(<g><path d="M24 8Q50-20 76 8" fill="none" stroke="#fb7185" strokeWidth="12"/><path d="M29 8Q50-11 71 8" fill="none" stroke="#facc15" strokeWidth="7"/><path d="M34 8Q50-3 66 8" fill="none" stroke="#38bdf8" strokeWidth="4"/><g fill="#f8fafc"><circle cx="22" cy="10" r="12"/><circle cx="78" cy="10" r="12"/></g></g>);
    case "music_notes":
      return svg(<g fill="#22d3ee"><path d="M6 4v25a7 7 0 1 0 4 6V12l19-5v17a7 7 0 1 0 4 6V-4z"/><path d="M82 0v20a6 6 0 1 0 4 6V8l12 5V5z" fill="#f472b6"/></g>);
    case "gamer_wings":
      return svg(<g fill="#6366f1" stroke="#22d3ee" strokeWidth="1.5"><path d="M8 28L-18 2 3 10-8-12 29 17z"/><path d="M92 28l26-26-21 8 11-22-37 29z"/></g>);
    case "neon_bolts":
      return svg(<g fill="#22d3ee" stroke="#f0fdfa" strokeWidth="1"><path d="M4-8L-8 28H8L1 54l28-40H13L24-8z"/><path d="M96-8l12 36H92l7 26-28-40h16L76-8z"/></g>);
    case "robot_antenna":
      return svg(<g><path d="M50 12V-16" stroke="#94a3b8" strokeWidth="5"/><circle cx="50" cy="-20" r="8" fill="#ef4444"/><rect x="28" y="-1" width="44" height="20" rx="7" fill="#64748b"/><circle cx="40" cy="8" r="3" fill="#22d3ee"/><circle cx="60" cy="8" r="3" fill="#22d3ee"/></g>);
    case "space_helmet":
      return svg(<g fill="none"><path d="M-4 58C-4-20 104-20 104 58" stroke="#cbd5e1" strokeWidth="8"/><path d="M3 54C6-8 94-8 97 54" stroke="#38bdf8" strokeWidth="3" opacity=".8"/><circle cx="91" cy="18" r="5" fill="#fde68a"/></g>);
    case "moon_crown":
      return svg(<g><path d="M22 13l8-24 17 15L60-15l11 19 12-15-5 27z" fill="#312e81" stroke="#a78bfa" strokeWidth="2"/><path d="M55-9a12 12 0 1 0 10 18A10 10 0 1 1 55-9" fill="#fde68a"/></g>);
    case "autumn_leaves":
      return svg(<g>{[[8,5,-35],[29,-5,-12],[70,-5,12],[92,7,35]].map(([x,y,a],i)=><path key={i} d="M0-12L5-4 12-2 6 4 7 12 0 7-7 12-6 4-12-2-5-4z" fill={i%2?"#f97316":"#eab308"} transform={`translate(${x} ${y}) rotate(${a}) scale(.8)`}/>)}</g>);
    case "holly":
      return svg(<g><path d="M14 13Q23-8 46 2 29 14 14 13M86 13Q77-8 54 2 71 14 86 13" fill="#15803d"/><circle cx="45" cy="8" r="5" fill="#dc2626"/><circle cx="55" cy="8" r="5" fill="#b91c1c"/></g>);
    case "sun_rays":
      return svg(<g fill="#facc15">{Array.from({length:12},(_,i)=><path key={i} d="M46-26h8l-2 24h-4z" transform={`rotate(${i*30} 50 50)`}/>)}</g>);
    case "ocean_shells":
      return svg(<g fill="#fda4af" stroke="#0e7490" strokeWidth="1.5"><path d="M6 16Q18-12 34 16Q20 9 6 16z"/><path d="M66 16Q82-12 94 16Q80 9 66 16z"/><path d="M42 5q8-20 16 0l-8 10z" fill="#fde68a"/></g>);
    case "royal_crown":
      return svg(<g><path d="M15 12L8-15 34 1 50-22 66 1l26-16-7 27z" fill="#fbbf24" stroke="#92400e" strokeWidth="2"/><circle cx="50" cy="-5" r="5" fill="#ef4444"/><circle cx="22" cy="2" r="4" fill="#38bdf8"/><circle cx="78" cy="2" r="4" fill="#38bdf8"/></g>);
    case "diamond_wings":
      return svg(<g fill="#a5f3fc" stroke="#0891b2" strokeWidth="1.5"><path d="M15-9L-10 20 21 14 34 2z"/><path d="M85-9l25 29-31-6L66 2z"/><path d="M15-9L21 14 3 29z"/><path d="M85-9L79 14l18 15z"/></g>);
    case "laurels":
      return svg(<g fill="#d4af37">{[20,32,44,56,68,80].map((y,i)=><g key={y}><ellipse cx={12+i} cy={y} rx="8" ry="4" transform={`rotate(${-45+i*5} ${12+i} ${y})`}/><ellipse cx={88-i} cy={y} rx="8" ry="4" transform={`rotate(${45-i*5} ${88-i} ${y})`}/></g>)}</g>);
    case "magic_runes":
      return svg(<g className="rout-deco-orbit-inner" fill="none" stroke="#c4b5fd" strokeWidth="2"><circle cx="50" cy="50" r="59" strokeDasharray="3 7"/>{[0,60,120,180,240,300].map(a=><path key={a} d="M48-12h4v7h5l-7 8-7-8h5z" transform={`rotate(${a} 50 50)`}/>)}</g>);
    case "heart_orbit":
      return svg(<g className="rout-deco-orbit-inner" fill="#fb7185">{[0,90,180,270].map(a=><path key={a} d="M50-10c-9-8-15 5 0 15 15-10 9-23 0-15" transform={`rotate(${a} 50 50) scale(.65)`}/>)}</g>);
    case "comet_trail":
      return svg(<g><path d="M-12 78Q25 16 79-4" fill="none" stroke="#60a5fa" strokeWidth="5" strokeDasharray="4 5" opacity=".7"/><path d="M77-14l5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2z" fill="#fde68a"/></g>);
    case "confetti":
      return svg(<g>{[[5,0,"#f43f5e"],[20,-12,"#22c55e"],[38,2,"#3b82f6"],[61,-9,"#eab308"],[80,4,"#a855f7"],[96,-13,"#f97316"]].map(([x,y,c],i)=><rect key={i} x={Number(x)} y={Number(y)} width="5" height="12" rx="2" fill={String(c)} transform={`rotate(${i%2?25:-25} ${x} ${y})`}/>)}</g>);
    case "cloud_pals":
      return svg(<g fill="#e0f2fe" stroke="#7dd3fc"><path d="M-12 20q2-15 16-11 8-13 20 0 15-2 15 12z"/><path d="M61 13q2-15 16-11 8-13 20 0 15-2 15 12z"/></g>);
    default:
      return null;
  }
}
