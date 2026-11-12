/** Error code → human-readable explanation + fix for the Live Auth debugger. */
export type DebugHint = { title: string; fix: string };

const HINTS: Record<string, DebugHint> = {
  invalid_redirect_uri: {
    title: "Redirect-URI niet geregistreerd",
    fix: "Voeg exact deze URI toe onder Redirects (zelfde schema, host, poort en pad — geen trailing slash-verschil).",
  },
  missing_code_challenge: {
    title: "PKCE code_challenge ontbreekt",
    fix: "Dit app-type vereist PKCE. Genereer een code_verifier, stuur code_challenge=BASE64URL(SHA256(verifier)) en code_challenge_method=S256 mee.",
  },
  invalid_pkce_method: {
    title: "Verkeerde PKCE-methode",
    fix: "Gebruik code_challenge_method=S256 en een challenge van minstens 43 tekens. 'plain' wordt niet ondersteund.",
  },
  invalid_scope: {
    title: "Scope niet toegestaan",
    fix: "Vraag alleen scopes die je onder Scopes hebt aangezet, of zet de ontbrekende scope daar aan.",
  },
  invalid_client: {
    title: "Client niet herkend",
    fix: "Controleer client_id en client_secret (secret alleen server-side). Staat een IP-allowlist aan? Voeg dan het serveradres van je backend toe onder Security.",
  },
  invalid_grant: {
    title: "Code ongeldig",
    fix: "Codes zijn eenmalig en 60 seconden geldig. Wissel ze meteen in, met exact dezelfde redirect_uri en de originele code_verifier.",
  },
  invalid_request: {
    title: "Verplichte velden ontbreken",
    fix: "Stuur grant_type=authorization_code, code, redirect_uri en client_id mee als application/x-www-form-urlencoded.",
  },
  unsupported_grant_type: {
    title: "Grant type niet ondersteund",
    fix: "Alleen authorization_code is beschikbaar. Implicit en password flows worden bewust niet ondersteund.",
  },
  invalid_token: {
    title: "Access token ongeldig",
    fix: "Stuur 'Authorization: Bearer <access_token>'. Is het token verlopen? Laat de gebruiker opnieuw inloggen.",
  },
};

export function hintFor(code: string | null | undefined, message?: string): DebugHint | null {
  if (!code) return null;
  if (code === "invalid_grant" && message?.toLowerCase().includes("pkce")) {
    return {
      title: "PKCE-controle mislukt",
      fix: "De code_verifier hoort niet bij de code_challenge. Bewaar de verifier per login-poging (bv. in een HttpOnly-cookie) en stuur exact die mee.",
    };
  }
  if (code === "invalid_grant" && message?.toLowerCase().includes("redirect")) return HINTS["invalid_redirect_uri"]!;
  return HINTS[code] ?? { title: code, fix: "Onbekende fout. Controleer de request-parameters tegen de Discovery-URL." };
}
