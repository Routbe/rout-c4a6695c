/** Best-effort friendly name so the passkey list is readable. */
export function deviceLabelFrom(userAgent: string | null): string {
  const ua = userAgent ?? "";
  if (/iPhone|iPad|iOS/i.test(ua)) return "iPhone or iPad";
  if (/Macintosh|Mac OS/i.test(ua)) return "Mac";
  if (/Android/i.test(ua)) return "Android device";
  if (/Windows/i.test(ua)) return "Windows Hello or security key";
  if (/Linux/i.test(ua)) return "Linux device";
  return "Passkey";
}
