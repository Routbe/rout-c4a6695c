/** Browser-safe YouTube card helpers (no secrets, testable). */

export type YouTubeVideo = { id: string; title: string; thumb: string | null; url: string };
export type YouTubeCard = {
  channelId: string;
  title: string;
  avatar: string | null;
  url: string;
  subscribers: number | null;
  views: number | null;
  /** Public video count (statistics.videoCount); missing in older cached cards. */
  videoCount?: number | null;
  videos: YouTubeVideo[];
};

/** Compact counts: 950 → "950", 1200 → "1.2K", 3400000 → "3.4M". */
export function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "–";
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [v, s] of units) {
    if (n >= v) {
      const x = n / v;
      const r = x >= 100 ? Math.round(x).toString() : (Math.floor(x * 10) / 10).toString();
      return `${r.replace(/\.0$/, "")}${s}`;
    }
  }
  return Math.round(n).toString();
}
