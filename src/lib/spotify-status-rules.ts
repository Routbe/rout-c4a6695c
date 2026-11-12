/** Maps Spotify "currently playing" responses to a reason + plain message. Browser-safe. */
export type SpotifyReason =
  | "playing"
  | "not_playing"
  | "no_content"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "unsupported_type"
  | "not_connected"
  | "error";

export function reasonFromStatus(status: number): SpotifyReason | null {
  if (status === 204) return "no_content";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate_limited";
  if (status >= 400) return "error";
  return null;
}

export function explainSpotifyReason(reason: SpotifyReason, title?: string): string {
  switch (reason) {
    case "playing": return `Werkt: nu speelt ${title ?? "een nummer"}.`;
    case "not_playing": return "Spotify meldt dat er nu niets speelt (gepauzeerd).";
    case "no_content": return "Spotify ziet geen actieve speler. Start muziek op een apparaat, of zet een Privésessie uit.";
    case "unauthorized": return "Spotify-toegang is verlopen of ingetrokken. Ontkoppel en koppel opnieuw.";
    case "forbidden": return "Spotify weigert je account. Staat de app in Development mode? Voeg je Spotify-e-mail toe onder User Management in het Spotify Developer Dashboard.";
    case "rate_limited": return "Spotify vraagt om even te wachten. Probeer zo opnieuw.";
    case "unsupported_type": return "Je speelt iets dat Spotify niet deelt (bv. een advertentie).";
    case "not_connected": return "Spotify is niet gekoppeld.";
    default: return "Spotify gaf een onverwachte fout. Probeer later opnieuw.";
  }
}
