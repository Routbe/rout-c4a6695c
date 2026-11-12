/**
 * Dutch count + noun with the right singular/plural form.
 * plural(1, "melding", "meldingen") → "1 melding"; null renders "—".
 */
export function plural(n: number | null | undefined, one: string, many: string): string {
  if (n == null) return `— ${many}`;
  return `${n} ${n === 1 ? one : many}`;
}
