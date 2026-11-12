/** Bounded manual grid upload validation, shared by browser and server. */
export const GRID_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export function decodeGridWebp(base64: string): Uint8Array | null {
  try {
    if (!base64 || base64.length > Math.ceil(GRID_UPLOAD_MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return null;
    const binary = atob(base64);
    if (binary.length < 12 || binary.length > GRID_UPLOAD_MAX_BYTES || binary.slice(0, 4) !== "RIFF" || binary.slice(8, 12) !== "WEBP") return null;
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch { return null; }
}