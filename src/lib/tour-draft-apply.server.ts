import type { TourDraft } from "@/lib/tour-draft";

export type DraftApplyResult = "applied" | "handle_taken" | "skipped";

/** Accounts younger than this count as "just signed up" (free handle auto-assigned at sign-up). */
const NEW_ACCOUNT_WINDOW_MS = 30 * 60 * 1000;

export type DraftApplyDeps = {
  readAccount: (userId: string) => Promise<{ handle: string | null; createdAt: Date | null }>;
  claimHandle: (userId: string, handle: string) => Promise<{ ok: boolean; handle?: string }>;
  writeProfile: (userId: string, input: Record<string, unknown> & { username: string }) => Promise<unknown>;
  now?: () => number;
};

function draftBlocks(socials: Record<string, string>) {
  return Object.entries(socials ?? {})
    .filter(([, v]) => typeof v === "string" && v.trim() !== "")
    .map(([kind, value]) => ({ id: `onboarding-${kind}`, kind, label: kind, value: value.trim() }));
}

function draftPrefs(d: TourDraft) {
  return {
    typography: d.typography,
    backgroundStyle: d.backgroundStyle,
    wallpaperType: d.wallpaperType,
    ...(d.wallpaperColor ? { wallpaperColor: d.wallpaperColor } : {}),
    wallpaperGradient: d.wallpaperGradient,
    fontPairing: d.fontPairing,
    footerTagline: d.footerTagline,
    footerStyle: d.footerStyle,
    ...(d.footerAccent ? { footerAccent: d.footerAccent } : {}),
    showRoutBadge: d.showRoutBadge,
  };
}

/**
 * Applies a tour draft to a freshly created account. Existing members are never
 * overwritten (`skipped`). When the chosen handle is no longer free the rest of
 * the choices are still saved (if the account already has a handle) and the
 * caller sends the member to onboarding to pick a name (`handle_taken`).
 */
export async function applyTourDraftToUser(
  userId: string,
  draft: TourDraft,
  deps?: DraftApplyDeps,
): Promise<DraftApplyResult> {
  const d = deps ?? (await defaultDeps());
  const now = (d.now ?? Date.now)();
  const account = await d.readAccount(userId);
  const isNew =
    !account.handle ||
    (account.createdAt !== null && now - account.createdAt.getTime() < NEW_ACCOUNT_WINDOW_MS);
  if (!isNew) return "skipped";

  let username: string | null = null;
  let taken = false;
  const wanted = (draft.handle ?? "").trim();
  if (wanted) {
    const claim = await d.claimHandle(userId, wanted).catch(() => ({ ok: false }) as { ok: boolean; handle?: string });
    if (claim.ok) username = claim.handle ?? wanted;
    else taken = true;
  } else {
    taken = true; // no name chosen in the tour: let onboarding ask for one
  }
  username = username ?? account.handle;

  if (username) {
    await d.writeProfile(userId, {
      username,
      displayName: draft.displayName?.trim() || null,
      tagline: draft.bio?.trim() || null,
      avatarUrl: draft.avatarUrl?.trim() || null,
      theme: draft.theme || null,
      cardStyle: "bordered",
      blocks: draftBlocks(draft.socials),
      displayPrefs: draftPrefs(draft),
    });
  }
  return taken ? "handle_taken" : "applied";
}

async function defaultDeps(): Promise<DraftApplyDeps> {
  const { sql } = await import("@/lib/neon");
  const { claimHandleFor } = await import("@/lib/claim.server");
  const { readStudioProfile } = await import("@/lib/studio-profile.server");
  const { readOrCreateProfileDraft, patchProfileDraft } = await import("@/lib/profile-drafts.server");
  return {
    readAccount: async (userId) => {
      const rows = (await sql`
        select username, created_at from public.profiles where id = ${userId} limit 1
      `) as Record<string, unknown>[];
      const r = rows[0];
      return {
        handle: (r?.["username"] as string | null) ?? null,
        createdAt: r?.["created_at"] ? new Date(r["created_at"] as string) : null,
      };
    },
    claimHandle: (userId, handle) => claimHandleFor(userId, handle) as Promise<{ ok: boolean; handle?: string }>,
    writeProfile: async (userId, input) => {
      const live = await readStudioProfile(userId);
      if (!live) throw new Error("profile_not_found");
      await readOrCreateProfileDraft(userId, "verified", {
        username: live.username ?? input.username,
        displayName: live.displayName,
        tagline: live.tagline,
        avatarUrl: live.avatarUrl,
        faviconUrl: live.faviconUrl,
        theme: live.theme,
        cardStyle: live.cardStyle,
        blocks: live.blocks,
        displayPrefs: live.displayPrefs,
      });
      const { displayPrefs, ...fields } = input;
      return patchProfileDraft(userId, "verified", { fields, prefs: displayPrefs as Record<string, unknown> });
    },
  };
}
