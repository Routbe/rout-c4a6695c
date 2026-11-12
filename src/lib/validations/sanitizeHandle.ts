/**
 * Single source of truth voor het opschonen van handles uit URL's, formulieren
 * en API-parameters.
 *
 *   `%40jona.delplanche` → `jona.delplanche`
 *   ` @Jonaa `           → `jonaa`
 *
 * Elke publieke route en elke databasequery hoort deze functie te gebruiken,
 * zodat `rout.be/u/@jona`, `rout.be/u/%40jona` en `rout.be/jona` exact dezelfde
 * rij ophalen.
 */
export function sanitizeHandleInput(rawInput: string | null | undefined): string {
  if (!rawInput) return "";
  let decoded = String(rawInput);
  try {
    // Dubbele encoding (%2540) komt voor bij doorgestuurde links.
    decoded = decodeURIComponent(decoded);
    if (/%[0-9a-fA-F]{2}/.test(decoded)) decoded = decodeURIComponent(decoded);
  } catch {
    /* ongeldige escape-reeks: val terug op de ruwe invoer */
  }
  return decoded.trim().replace(/\s+/g, "").replace(/^@+/, "").toLowerCase();
}

/** Alias met een sprekende naam voor gebruik in publieke profielroutes. */
export const cleanProfileHandle = sanitizeHandleInput;
