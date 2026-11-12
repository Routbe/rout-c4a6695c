/** Haalt een 6-cijferige code uit een Telegram-bericht ("123456" of "/verify 123456"). */
export function extractTelegramCode(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.trim().match(/^(?:\/(?:verify|start)(?:@\w+)?\s+)?(\d{6})$/i);
  return m?.[1] ?? null;
}

/** Normaliseert een Telegram-contactnummer naar E.164 (+...). */
export function normalizeTelegramPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}
