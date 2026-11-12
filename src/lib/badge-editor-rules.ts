/** Browser-safe badge input rules; server validators use the same URL normalization. */
export function normalizeBadgeWebsite(input: unknown): string | null {
  if (input == null || input === "") return null;
  if (typeof input !== "string") throw new Error("Invalid website");
  const value = input.trim();
  if (!value) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https:\/\//i.test(value)) throw new Error("Use HTTPS");
  const url = new URL(/^https:\/\//i.test(value) ? value : `https://${value}`);
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") || url.hostname === "localhost") throw new Error("Invalid website");
  return url.href;
}

export async function suggestBadgeAccent(file: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 32; canvas.height = 32;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data;
    const groups = new Map<string, { count: number; rgb: number[] }>();
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] ?? 0, g = pixels[i + 1] ?? 0, b = pixels[i + 2] ?? 0;
      if ((pixels[i + 3] ?? 0) < 160 || Math.max(r,g,b) - Math.min(r,g,b) < 25) continue;
      const key = [r,g,b].map(v => Math.round(v / 32)).join(",");
      const group = groups.get(key) ?? { count: 0, rgb: [r,g,b] };
      group.count++; groups.set(key, group);
    }
    const best = [...groups.values()].sort((a,b) => b.count - a.count)[0];
    return best ? `#${best.rgb.map(v => v.toString(16).padStart(2,"0")).join("")}` : null;
  } finally { bitmap.close(); }
}