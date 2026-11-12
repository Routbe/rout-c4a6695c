import { sanitizeHandleInput } from "@/lib/validations/sanitizeHandle";
import { createFileRoute } from "@tanstack/react-router";

/**
 * "Verified on ROUT" badge — publieke SVG die makers op hun eigen site kunnen
 * embedden. Geen PII: alleen handle en verificatiestatus, met dezelfde regels als het profiel.
 */
function escapeXml(value: string) {
  return value.replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c,
  );
}

type Theme = "dark" | "light";
type Size = "sm" | "md";

const PALETTE: Record<Theme, { bg: string; border: string; muted: string; text: string }> = {
  dark: { bg: "#0f0f11", border: "#2a2a30", muted: "#8a8a94", text: "#f4efe3" },
  light: { bg: "#ffffff", border: "#e4e2dc", muted: "#6b6b74", text: "#141416" },
};

type Kind = "verified" | "shield" | "plain";

function badgeSvg(handle: string, kind: Kind, theme: Theme, size: Size) {
  const c = PALETTE[theme];
  const label = `@${handle}`;
  const h = size === "sm" ? 28 : 40;
  const scale = h / 40;
  const baseW = Math.max(190, 118 + label.length * 8);
  const width = Math.round(baseW * scale);
  const accent = kind === "verified" ? (theme === "dark" ? "#3ea6ff" : "#1d7fe0") : kind === "shield" ? (theme === "dark" ? "#c9b273" : "#8f7833") : c.muted;
  const mark = kind === "verified"
    ? `<path d="M-3.2 0.2 -1 2.4 3.4 -2.2" fill="none" stroke="${accent}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><circle r="7.4" fill="none" stroke="${accent}" stroke-width="1.6"/>`
    : kind === "shield"
      ? `<path d="M0 -7.6 6.6 -4.8V0.6C6.6 4.2 3.8 6.6 0 7.8 -3.8 6.6 -6.6 4.2 -6.6 0.6V-4.8Z" fill="none" stroke="${accent}" stroke-width="1.6"/><path d="M-2.9 0.2 -0.8 2.2 3 -1.9" fill="none" stroke="${accent}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<circle r="6.4" fill="none" stroke="${accent}" stroke-width="1.6"/>`;
  const caption = kind === "verified" ? "VERIFIED ON ROUT" : kind === "shield" ? "PRIVACY SHIELD" : "ON ROUT";
  const spoken = kind === "verified" ? "verified on ROUT" : kind === "shield" ? "verified human (privacy shield) on ROUT" : "on ROUT";
  const font = "ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${baseW} 40" role="img" aria-label="${escapeXml(label)} — ${spoken}"><rect x="0.5" y="0.5" width="${baseW - 1}" height="39" rx="10" fill="${c.bg}" stroke="${c.border}"/><g transform="translate(24 20)">${mark}</g><text x="42" y="16.5" font-family="${font}" font-size="9" letter-spacing="1.4" fill="${c.muted}">${caption}</text><text x="42" y="29.5" font-family="${font}" font-size="12.5" font-weight="600" fill="${c.text}">${escapeXml(label)}</text></svg>`;
}

export const Route = createFileRoute("/api_/public/badge/$handle")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const q = new URL(request.url).searchParams;
        const theme: Theme = q.get("theme") === "light" ? "light" : "dark";
        const size: Size = q.get("size") === "sm" ? "sm" : "md";
        const handle = sanitizeHandleInput(String(params.handle ?? "").replace(/\.svg$/i, ""));

        if (!/^[a-z0-9._-]{2,40}$/.test(handle)) {
          return new Response("Invalid handle", { status: 400 });
        }

        // Same visibility and badge gate as the profile page: banned, suspended or
        // private profiles are "not found"; an unverified or hidden badge never shows a mark.
        let kind: Kind = "plain";
        try {
          const { readOgProfile } = await import("@/lib/og-profile.server");
          const { parseDisplayPrefs } = await import("@/lib/profile-display");
          const { publicBadgeKind } = await import("@/lib/badge-rules");
          const row = await readOgProfile(handle, "root");
          if (!row) return new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=300" } });
          const prefs = parseDisplayPrefs(row["display_prefs"]);
          const badge = publicBadgeKind({
            verified: row["verified"] === true,
            isBusiness: row["is_business"] === true,
            isInfluencer: row["is_influencer"] === true,
            badgeVisible: prefs.badgeVisible,
            badgeType: prefs.badgeType,
          });
          kind = badge === "human" ? "shield" : badge ? "verified" : "plain";
        } catch {
          // Database unreachable: a neutral badge, never a trust mark.
          kind = "plain";
        }

        return new Response(badgeSvg(handle, kind, theme, size), {
          headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            // Short cache: a withdrawn verification must disappear from other sites quickly.
            "cache-control": kind === "plain" ? "public, max-age=300" : "public, max-age=600, s-maxage=600, stale-while-revalidate=3600",
            "access-control-allow-origin": "*",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
