import { z } from "zod";
import { mastodonAvatarSrc } from "./mastodon-avatar";

/** Accept only the two exact first-party avatar handlers, not arbitrary app paths. */
export function isFirstPartyAvatarUrl(value: string): boolean {
  if (value.startsWith("/api/public/integrations/mastodon/avatar?")) {
    try {
      const url = new URL(value, "https://rout.be");
      const entries = [...url.searchParams.entries()];
      const handle = entries[0]?.[1];
      return !url.hash && entries.length === 1 && entries[0]?.[0] === "handle" &&
        typeof handle === "string" && mastodonAvatarSrc(handle) === value;
    } catch { return false; }
  }
  if (!value.startsWith("/api/public/avatar?")) return false;
  try {
    const url = new URL(value, "https://rout.be");
    const entries = [...url.searchParams.entries()];
    return !url.hash && entries.length === 1 && entries[0]?.[0] === "path" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/avatar-\d+\.(jpg|png|webp|gif)$/i.test(entries[0]?.[1] ?? "");
  } catch { return false; }
}

export const optionalProfileImageUrlSchema = z.string().trim().max(2_000)
  .refine(value => !value || value.startsWith("https://") || value.startsWith("data:image/") || isFirstPartyAvatarUrl(value), "invalid_url")
  .nullable().optional();