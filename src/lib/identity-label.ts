/** Kiest een leesbare naam voor een gekoppelde identiteit (pure, getest). */
export type ProfileLike = {
  email?: unknown;
  login?: unknown;
  username?: unknown;
  preferred_username?: unknown;
  nickname?: unknown;
  name?: unknown;
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);

export function pickIdentityLabel(provider: string, p: ProfileLike | null | undefined): string | null {
  if (!p) return null;
  const handle = str(p.login) ?? str(p.username) ?? str(p.preferred_username) ?? str(p.nickname);
  const email = str(p.email);
  // Google: e-mail is de herkenbare sleutel. GitHub/GitLab/Infomaniak: gebruikersnaam eerst.
  if (provider === "google") return email ?? handle ?? str(p.name);
  if (handle) return provider === "github" || provider === "gitlab" ? `@${handle.replace(/^@/, "")}` : handle;
  return email ?? str(p.name);
}

/** Leest de (niet-geverifieerde) payload van een eigen opgeslagen id_token — enkel voor weergave. */
export function decodeJwtPayload(token: string | null | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const json = decodeURIComponent(
      Array.from(atob(b64), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""),
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
