/** Eén pagina uit een lijst; `page` is 1-based en wordt binnen bereik geklemd. */
export function paginate<T>(items: readonly T[], page: number, size = 10) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), page: current, pages };
}
