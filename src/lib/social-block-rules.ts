export const socialHandleKey = (value: string) => value.trim().replace(/^@+/, "").toLowerCase();
export function publicFollowerCount(verified: boolean, enabled: boolean, count: number | null): number | null {
  return verified && enabled ? count : null;
}
