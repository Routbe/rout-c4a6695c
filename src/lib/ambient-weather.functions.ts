import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./auth/middleware";

export const getMyWeatherSettings = createServerFn({ method: "GET" }).middleware([requireAuth]).handler(async ({ context }) => {
  const s = await import("./ambient-weather.server");
  return s.myWeatherSettings(context.userId);
});
export const createWeatherWebhook = createServerFn({ method: "POST" }).middleware([requireAuth]).handler(async ({ context }) => {
  const s = await import("./ambient-weather.server");
  return { token: await s.rotateWeatherWebhook(context.userId) };
});
export const removeWeatherWebhook = createServerFn({ method: "POST" }).middleware([requireAuth]).handler(async ({ context }) => {
  const s = await import("./ambient-weather.server");
  await s.clearWeatherWebhook(context.userId);
  return { ok: true };
});