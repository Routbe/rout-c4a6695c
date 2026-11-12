import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/middleware";
import { GUESTBOOK_MAX } from "./guestbook-rules";

const handle = z.string().trim().regex(/^@?[A-Za-z0-9._-]{1,64}$/).transform((h) => h.replace(/^@/, ""));

/** Public: pinned notes only, and only for public profiles. */
export const getPinnedNotes = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ handle }).parse(input))
  .handler(async ({ data }) => {
    const s = await import("./guestbook.server");
    try {
      return { notes: await s.pinnedNotes(data.handle) };
    } catch (e) {
      console.error("[guestbook] pinned failed", e instanceof Error ? e.message : e);
      return { notes: [] };
    }
  });

export const postGuestbookNote = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ handle, body: z.string().max(GUESTBOOK_MAX * 4) }).parse(input))
  .handler(async ({ data, context }) => {
    await (await import("@/lib/platform-features.server")).assertPlatformFeature("guestbook");
    const s = await import("./guestbook.server");
    return { result: await s.postNote(context.userId, data.handle, data.body) };
  });

export const getMyGuestbook = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const s = await import("./guestbook.server");
    try {
      return { ready: true, notes: await s.myInbox(context.userId) };
    } catch (e) {
      console.error("[guestbook] inbox failed", e instanceof Error ? e.message : e);
      return { ready: false, notes: [] };
    }
  });

const idSchema = z.object({ id: z.string().uuid() });

export const pinGuestbookNote = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => idSchema.extend({ pinned: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./guestbook.server");
    return { result: await s.setPinned(context.userId, data.id, data.pinned) };
  });

export const deleteGuestbookNote = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const s = await import("./guestbook.server");
    await s.deleteNote(context.userId, data.id);
    return { ok: true };
  });
