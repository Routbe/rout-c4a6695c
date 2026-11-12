export const EMAIL_RECOVERY_HOURS = 48;
export const EMAIL_RECOVERY_MS = 48 * 60 * 60 * 1000;
export function recoveryWindowOpen(createdAt: number, now: number) {
  return now >= createdAt && now < createdAt + EMAIL_RECOVERY_MS;
}