/** Exact first-party gallery URL shape shared by Studio, save validation and rendering. */
export function localGridMediaPath(value: string): string | null {
  try {
    if (!value.startsWith("/api/public/gallery-media?")) return null;
    const url = new URL(value, "https://rout.be");
    const path = url.searchParams.get("path") ?? "";
    if (url.hash || url.pathname !== "/api/public/gallery-media" ||
      url.searchParams.getAll("path").length !== 1 || [...url.searchParams.keys()].some((key) => key !== "path") ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(path)) return null;
    return path;
  } catch { return null; }
}