import type { ProfileBlock, ProfileRecord } from "./profile";
import type { WorkspaceHub } from "./workspace-hub";

/**
 * Workspace Studio parity: a workspace's Profile Hub is edited by the same
 * Studio engine as a personal profile and stored in the same payload shape.
 * Pure and browser-safe: shared by the server (seed, publish), the public page
 * and tests.
 *
 * Storage: the draft lives in `workspace_profile_drafts` (never public); a
 * publish copies it to `workspaces.public_profile.studio`.
 */

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export type WorkspaceStudioPayload = {
  username: string;
  displayName: string | null;
  tagline: string | null;
  avatarUrl: string | null;
  faviconUrl: string | null;
  theme: string;
  cardStyle: string;
  blocks: Json[];
  displayPrefs: Record<string, Json>;
};

/**
 * Personal-only features that read data by a member's handle (guestbook,
 * questions inbox, badges, timeline). A workspace has no member handle, so
 * these stay off on its page: it could otherwise show a person's data that
 * happens to share the workspace slug.
 */
export const WORKSPACE_PERSONAL_ONLY_PREFS = [
  "questionsEnabled",
  "guestbookEnabled",
  "badgeShowcaseVisible",
  "timelineVisible",
] as const;

const asText = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

/** First Studio draft of a workspace, built from its name, avatar and the legacy hub (tagline, bio, links). */
export function seedWorkspaceStudio(
  ws: { slug: string; name: string; avatarUrl: string | null },
  hub: WorkspaceHub | null,
  makeId: (index: number) => string = (i) => `b_ws${i.toString(36)}`,
): WorkspaceStudioPayload {
  const tagline = asText(hub?.tagline, 240) ?? asText(hub?.bio, 240);
  const blocks = (hub?.links ?? []).map((link, i) => ({
    id: makeId(i),
    kind: "link",
    label: link.title,
    value: link.url,
  }));
  return {
    username: ws.slug,
    displayName: asText(ws.name, 120),
    tagline,
    avatarUrl: ws.avatarUrl,
    faviconUrl: null,
    theme: "noir",
    cardStyle: "bordered",
    blocks,
    displayPrefs: {},
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The published Studio payload on `workspaces.public_profile`, or null (legacy hub or not published). */
export function readPublishedStudio(publicProfile: unknown): WorkspaceStudioPayload | null {
  if (!isRecord(publicProfile) || publicProfile["published"] !== true) return null;
  const studio = publicProfile["studio"];
  if (!isRecord(studio)) return null;
  // Alleen geldige blokken ({kind, value} als strings) mogen de publieke
  // renderer bereiken — een misvormd blok mag nooit de hele pagina breken.
  const blocks = (Array.isArray(studio["blocks"]) ? studio["blocks"] : []).filter(
    (b): b is Json => isRecord(b) && typeof b["kind"] === "string" && typeof b["value"] === "string",
  );
  return {
    username: typeof studio["username"] === "string" ? studio["username"] : "",
    displayName: asText(studio["displayName"], 120),
    tagline: asText(studio["tagline"], 240),
    avatarUrl: asText(studio["avatarUrl"], 2000),
    faviconUrl: asText(studio["faviconUrl"], 2000),
    theme: asText(studio["theme"], 40) ?? "noir",
    cardStyle: asText(studio["cardStyle"], 40) ?? "bordered",
    blocks,
    displayPrefs: isRecord(studio["displayPrefs"]) ? (studio["displayPrefs"] as Record<string, Json>) : {},
  };
}

/** Does the workspace keep its page public? Mirrors the personal `publicProfile` switch (default on). */
export function workspaceStudioIsPublic(payload: WorkspaceStudioPayload): boolean {
  return payload.displayPrefs["publicProfile"] !== false;
}

/**
 * Render model for ProfileView. `username` stays null on purpose: every
 * handle-bound personal widget is skipped, and the page never carries a
 * verified-human badge (a workspace is not a person).
 */
export function workspaceProfileRecord(workspaceId: string, payload: WorkspaceStudioPayload): ProfileRecord {
  const prefs: Record<string, Json> = { ...payload.displayPrefs };
  for (const key of WORKSPACE_PERSONAL_ONLY_PREFS) prefs[key] = false;
  return {
    id: workspaceId,
    username: null,
    display_name: payload.displayName,
    tagline: payload.tagline,
    avatar_url: payload.avatarUrl,
    favicon_url: payload.faviconUrl,
    theme: payload.theme,
    card_style: payload.cardStyle,
    blocks: payload.blocks as unknown as ProfileBlock[],
    verified: false,
    human_linked: false,
    status: "active",
    display_prefs: prefs,
  } as ProfileRecord;
}
