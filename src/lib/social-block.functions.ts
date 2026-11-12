import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth/middleware";
const validate = (input: { platform: string; handle: string; enabled?: boolean }) => {
  if (typeof input.platform !== "string" || !/^[a-z]+$/.test(input.platform) || typeof input.handle !== "string" || input.handle.length > 200 || (input.enabled !== undefined && typeof input.enabled !== "boolean")) throw new Error("invalid_input");
  return input;
};
export const getSocialBlockStatus = createServerFn({ method: "GET" }).middleware([requireAuth]).inputValidator(validate).handler(async ({ data, context }) => {
  const { socialBlockStatus } = await import("./social-block.server");
  return socialBlockStatus(context.userId, data.platform, data.handle);
});
export const toggleSocialBlockFollowers = createServerFn({ method: "POST" }).middleware([requireAuth]).inputValidator(validate).handler(async ({ data, context }) => {
  const { socialBlockStatus } = await import("./social-block.server");
  const { sql } = await import("./neon");
  const { socialHandleKey } = await import("./social-block-rules");
  const status = await socialBlockStatus(context.userId, data.platform, data.handle);
  if (data.enabled && !status.verified) throw new Error("not_verified");
  await sql`insert into public.social_block_settings (profile_id, platform, handle, show_followers) values (${context.userId}, ${data.platform}, ${socialHandleKey(data.handle)}, ${data.enabled === true}) on conflict (profile_id, platform, handle) do update set show_followers = excluded.show_followers`;
  return { ok: true };
});
