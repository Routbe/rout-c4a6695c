/**
 * Filename helpers for every export route (SVG + high-res PNG/JPEG).
 *
 * Naming schema: `rout-<preset>-<format>-<timestamp>.<ext>`
 * e.g. `rout-midnight-png-20260806-134502.png`
 */

/** Strict slug: strips accents, punctuation and collapses separators. */
export function slugify(input: string, fallback = "rout-export"): string {
  const slug = (input ?? "")
    .normalize("NFKD")

    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Letters that do not decompose via NFKD.
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/ß/g, "ss")
    .replace(/[đð]/g, "d")
    .replace(/þ/g, "th")
    .replace(/ł/g, "l")
    .replace(/&/g, " and ")

    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || fallback;
}

/** Compact, sortable, high-precision stamp: YYYYMMDD-HHMMSS. */
export function exportTimestamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}

/** Canonical extension for a format — never duplicated or truncated. */
export function extensionFor(format: string): string {
  const f = format.toLowerCase();
  if (f === "jpeg" || f === "jpg") return "jpg";
  if (f === "svg") return "svg";
  return "png";
}

/**
 * Build the full download filename (with extension).
 *
 * `preset` is any user-facing label (custom filename, theme or QR type); it is
 * slugified so the result is always filesystem-safe.
 */
export function buildExportFilename({
  preset,
  format,
  date,
  prefix = "rout",
}: {
  preset: string;
  format: string;
  date?: Date;
  prefix?: string;
}): string {
  const ext = extensionFor(format);
  const base = slugify(preset, "qr");
  const withoutExt = base.replace(new RegExp(`-?${ext}$`), "") || "qr";
  const head = withoutExt.startsWith(`${prefix}-`) ? withoutExt : `${prefix}-${withoutExt}`;
  return `${head}-${ext}-${exportTimestamp(date)}.${ext}`;
}
