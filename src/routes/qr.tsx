import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * /qr — verhuisd naar de Studio (`/studio?mode=qr`), de exclusieve plek voor
 * creatie. Deze permanente redirect bewaart bestaande deeplinks (`?type=`,
 * `?url=`).
 */
export const Route = createFileRoute("/qr")({
  beforeLoad: ({ search }) => {
    const params = new URLSearchParams({ mode: "qr" });
    const s = search as Record<string, unknown>;
    if (typeof s["type"] === "string") params.set("type", s["type"]);
    if (typeof s["url"] === "string") params.set("url", s["url"]);
    if (typeof s["workspace"] === "string") params.set("workspace", s["workspace"]);
    throw redirect({ href: `/studio?${params.toString()}`, statusCode: 301 });
  },
});
