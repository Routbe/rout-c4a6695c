import { ogFormatQuery, type OgFormat } from "@/lib/og-formats";

/** Separate namespaces: an alias must never render a same-named root profile. */
export function profilePreviewPath(handle: string, space: "root" | "alias" | "workspace" = "root", format: "png" | "svg" = "png", size: OgFormat = "landscape") {
  const q = [space === "root" ? "" : `space=${space}`, ogFormatQuery(size)].filter(Boolean).join("&");
  return `/api/public/og/${encodeURIComponent(handle.replace(/^@+/, "").trim())}.${format}${q ? `?${q}` : ""}`;
}
