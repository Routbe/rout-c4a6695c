/** Which tiles the frame/decoration grid shows for a given pill + search. */
export type DecorLike = { id: string; label: string; category: string; keywords?: string };
export const POPULAR_LIMIT = 8;

export function filterDecor<T extends DecorLike>(
  items: T[],
  opts: { filter: string; q: string; favs: string[]; popular: string[] },
): T[] {
  const words = opts.q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length) {
    // Search always covers the whole list, whatever pill is active.
    return items.filter((d) => {
      const hay = `${d.label} ${d.category} ${d.keywords ?? ""} ${d.id.replace(/_/g, " ")}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }
  if (opts.filter === "popular") {
    const ids = [...new Set([...opts.favs, ...opts.popular])];
    return ids.map((id) => items.find((i) => i.id === id)).filter((x): x is T => Boolean(x)).slice(0, POPULAR_LIMIT);
  }
  if (opts.filter === "fav") return items.filter((d) => opts.favs.includes(d.id));
  if (opts.filter === "all") return items;
  return items.filter((d) => d.category === opts.filter);
}
