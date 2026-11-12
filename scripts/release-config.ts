/** Pure release validation. Reports names and reasons, never configured values. */
export const RELEASE_REQUIRED = [
  "DATABASE_URL", "PUBLIC_ORIGIN",
] as const;

export function validateReleaseEnvironment(env: Record<string, string | undefined>) {
  const issues: { key: string; reason: string }[] = [];
  for (const key of RELEASE_REQUIRED) {
    if (!env[key]?.trim()) issues.push({ key, reason: "Missing required setting" });
  }
  return issues;
}

/** Invalid optional URL formatting warns without blocking the release. */
export function releaseEnvironmentWarnings(env: Record<string, string | undefined>): string[] {
  if (!env.PUBLIC_ORIGIN?.trim()) return [];
  try {
    const url = new URL(env.PUBLIC_ORIGIN.trim());
    if (url.protocol === "https:" && !url.username && !url.password) return [];
  } catch { /* Never include configured values in diagnostics. */ }
  return ["PUBLIC_ORIGIN should be a valid HTTPS URL without credentials; authentication will use its safe fallback."];
}