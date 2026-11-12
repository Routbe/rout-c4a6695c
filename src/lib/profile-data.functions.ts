import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";
import { BIO_LINK_MESSAGE, BIO_MEMBER_SINCE_MESSAGE, bioClaimsMemberSince, bioContainsLink } from "@/lib/bio-rules";

/** Server RPC layer backing the /dashboard/profile page. */
export const getProfileSettings = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { readProfileSettings } = await import("./profile-data.server");
    return readProfileSettings(context.userId);
  });

export type SaveProfileSettingsInput = {
  username: string | null;
  displayName: string | null;
  tagline: string | null;
  bio: string | null;
  avatarUrl: string | null;
};

export const saveProfileSettings = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: SaveProfileSettingsInput): SaveProfileSettingsInput => {
    const str = (v: unknown, max: number) =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
    const bio = str(input?.bio, 1000);
    if (bioContainsLink(bio)) throw new Error(BIO_LINK_MESSAGE);
    if (bioClaimsMemberSince(bio)) throw new Error(BIO_MEMBER_SINCE_MESSAGE);
    // Alleen deze vijf velden komen door: geen rollen, badges of verificatie.
    return {
      username: str(input?.username, 64),
      displayName: str(input?.displayName, 120),
      tagline: str(input?.tagline, 160),
      bio,
      avatarUrl: str(input?.avatarUrl, 2048),
    };
  })
  .handler(async ({ data, context }) => {
    const { writeProfileSettings } = await import("./profile-data.server");
    try {
      await writeProfileSettings(context.userId, data);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : "save_failed",
      };
    }
  });
