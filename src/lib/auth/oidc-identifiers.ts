/** Per-app "one human" proof for Login met ROUT. Pure; the pepper is passed in by server code. */
export async function appSybilNullifier(pepper: string, clientId: string, humanNullifier: string): Promise<string> {
  if (pepper.length < 32 || !clientId || !humanNullifier) throw new Error("invalid_nullifier_input");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  // Length-prefixed so "ab"+"c" and "a"+"bc" can never collide.
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${clientId.length}:${clientId}|${humanNullifier}`));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
