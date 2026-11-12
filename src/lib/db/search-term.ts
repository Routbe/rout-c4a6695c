/**
 * Maakt zoektekst veilig voor een PostgREST `.or()`-filter: alleen letters,
 * cijfers, spatie en `@._-` blijven over, zodat komma's, haakjes, punten-
 * operatoren of wildcards de filter niet kunnen veranderen. Max. 80 tekens.
 */
export function safeOrTerm(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} @._-]/gu, "")
    .trim()
    .slice(0, 80);
}
