import { sql } from "@/lib/neon";
import { decryptText, encryptText } from "@/lib/phone/phone-crypto";

const secret = () => process.env["PHONE_ENCRYPTION_KEY"] ?? "";

/** Webhook secret_token afgeleid van TELEGRAM_BOT_TOKEN (Telegram staat [A-Za-z0-9_-] toe). */
export async function telegramWebhookSecret(botToken: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`telegram-webhook:${botToken}`));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function telegramSend(botToken: string, chatId: number, text: string, replyMarkup?: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
  });
  if (!res.ok) console.warn(`[telegram] sendMessage failed [${res.status}]`);
}

export async function rememberContact(chatId: number, phone: string) {
  const enc = await encryptText(phone, secret());
  await sql`insert into public.telegram_verify_sessions (chat_id, phone_enc, expires_at)
    values (${chatId}, ${enc}, now() + interval '15 minutes')
    on conflict (chat_id) do update set phone_enc = excluded.phone_enc, expires_at = excluded.expires_at`;
}

export async function contactFor(chatId: number): Promise<string | null> {
  const rows = (await sql`select phone_enc from public.telegram_verify_sessions
    where chat_id = ${chatId} and expires_at > now() limit 1`) as { phone_enc: string }[];
  return rows[0] ? decryptText(rows[0].phone_enc, secret()) : null;
}

export async function forgetContact(chatId: number) {
  await sql`delete from public.telegram_verify_sessions where chat_id = ${chatId}`;
}
