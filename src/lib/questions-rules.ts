/** Anonymous Q&A rules (shared client/server). */
export const QUESTION_MAX = 300;
export const ANSWER_MAX = 1000;
/** Per visitor IP: at most 5 messages per minute… */
export const QUESTION_RATE = { limit: 5, windowSec: 60 } as const;
/** …and at most 20 per hour, so a slow bot cannot fill the void either. */
export const QUESTION_RATE_HOURLY = { limit: 20, windowSec: 3600 } as const;
/** Per recipient canvas: at most 5 messages per minute from everyone together. */
export const QUESTION_RATE_RECIPIENT = { limit: 5, windowSec: 60 } as const;
/** Device cookie that lets a recipient mute an anonymous sender without knowing them (host-only, Secure). */
export const QA_DEVICE_COOKIE = "__Host-rout_qa_sid";
export const QA_DEVICE_COOKIE_DAYS = 90;

export function normalizeText(raw: string, max: number): string | null {
  const s = raw.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").replace(/\s+\n/g, "\n").trim();
  return s.length === 0 || s.length > max ? null : s;
}
