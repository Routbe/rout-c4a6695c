import { z } from "zod";

/**
 * Pure rules for a workspace's own Profile Hub (link-in-bio) on rout.be/w/<slug>.
 * Stored on workspaces.public_profile; shared by the editor, the server and the public page.
 */

export const HUB_LIMITS = { tagline: 160, bio: 600, links: 20, linkTitle: 60, linkUrl: 500, audioTitle: 60, audioCaption: 500 } as const;

const httpsUrl = z
  .string()
  .trim()
  .max(HUB_LIMITS.linkUrl)
  .transform((v) => (/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`))
  .refine((v) => {
    try {
      const u = new URL(v);
      return (u.protocol === "https:" || u.protocol === "mailto:" || u.protocol === "tel:") && Boolean(u.hostname || u.pathname);
    } catch {
      return false;
    }
  }, "Gebruik een https-, mailto- of tel-link.");

export const hubLinkSchema = z.object({
  title: z.string().trim().min(1, "Geef de link een titel.").max(HUB_LIMITS.linkTitle),
  url: httpsUrl,
});

/** Universal audio block: a pointer to hosted audio, never a provider key. */
export const hubAudioSchema = z.object({
  title: z.string().trim().max(HUB_LIMITS.audioTitle).default(""),
  url: httpsUrl,
  caption: z.string().trim().max(HUB_LIMITS.audioCaption).default(""),
});
export type WorkspaceHubAudio = z.infer<typeof hubAudioSchema>;

export const workspaceHubSchema = z.object({
  tagline: z.string().trim().max(HUB_LIMITS.tagline).default(""),
  bio: z.string().trim().max(HUB_LIMITS.bio).default(""),
  links: z.array(hubLinkSchema).max(HUB_LIMITS.links, `Maximaal ${HUB_LIMITS.links} links.`).default([]),
  /** Optional audio block on the public hub (hosted MP3/stream URL). */
  audio: hubAudioSchema.nullable().default(null),
  published: z.boolean().default(false),
});

export type WorkspaceHub = z.infer<typeof workspaceHubSchema>;
export type WorkspaceHubLink = z.infer<typeof hubLinkSchema>;

export const emptyHub = (): WorkspaceHub => ({ tagline: "", bio: "", links: [], audio: null, published: false });

/** Reads stored JSON defensively: invalid or unknown data becomes an empty, unpublished hub. */
export function readHub(raw: unknown): WorkspaceHub {
  const parsed = workspaceHubSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : emptyHub();
}
