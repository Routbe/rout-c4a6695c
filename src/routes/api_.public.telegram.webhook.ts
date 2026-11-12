import { createFileRoute } from "@tanstack/react-router";

type TgMessage = {
  chat?: { id?: number; type?: string };
  from?: { id?: number };
  text?: string;
  contact?: { phone_number?: string; user_id?: number };
};

const SHARE_KEYBOARD = {
  keyboard: [[{ text: "📱 Deel mijn telefoonnummer", request_contact: true }]],
  one_time_keyboard: true,
  resize_keyboard: true,
};

/**
 * Telegram-bot webhook voor telefoonverificatie (internationale nummers).
 * Beveiligd met X-Telegram-Bot-Api-Secret-Token, afgeleid van TELEGRAM_BOT_TOKEN.
 * Flow: lid deelt eigen contact → stuurt code (of /verify <code>) → confirmInboundCode.
 */
export const Route = createFileRoute("/api_/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["TELEGRAM_BOT_TOKEN"];
        if (!token) return new Response("Not configured", { status: 503 });
        const { telegramWebhookSecret, telegramSend, rememberContact, contactFor, forgetContact } = await import(
          "@/lib/telegram-bot.server"
        );
        const expected = await telegramWebhookSecret(token);
        const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (got.length !== expected.length || got !== expected) return new Response("Unauthorized", { status: 401 });

        const update = (await request.json().catch(() => null)) as { message?: TgMessage } | null;
        const msg = update?.message;
        const chatId = msg?.chat?.id;
        if (!msg || typeof chatId !== "number" || msg.chat?.type !== "private") return Response.json({ ok: true });

        const { extractTelegramCode, normalizeTelegramPhone } = await import("@/lib/telegram-verify");

        // Only the sender's own contact counts (prevents verifying someone else's number).
        if (msg.contact?.phone_number) {
          if (msg.contact.user_id !== msg.from?.id) {
            await telegramSend(token, chatId, "Deel je eigen nummer via de knop hieronder.", SHARE_KEYBOARD);
            return Response.json({ ok: true });
          }
          await rememberContact(chatId, normalizeTelegramPhone(msg.contact.phone_number));
          await telegramSend(token, chatId, "Bedankt! Stuur nu je 6-cijferige ROUT-code.", { remove_keyboard: true });
          return Response.json({ ok: true });
        }

        const code = extractTelegramCode(msg.text);
        if (!code) {
          await telegramSend(token, chatId, "Deel eerst je telefoonnummer en stuur daarna je 6-cijferige code.", SHARE_KEYBOARD);
          return Response.json({ ok: true });
        }
        const phone = await contactFor(chatId);
        if (!phone) {
          await telegramSend(token, chatId, "Deel eerst je telefoonnummer via de knop hieronder.", SHARE_KEYBOARD);
          return Response.json({ ok: true });
        }
        const { confirmInboundCode } = await import("@/lib/phone/phone-otp.server");
        const verified = await confirmInboundCode(phone, code);
        if (verified) {
          await forgetContact(chatId);
          await telegramSend(token, chatId, "Je telefoonnummer is succesvol geverifieerd op ROUT!");
        } else {
          await telegramSend(token, chatId, "Deze code klopt niet of is verlopen. Vraag een nieuwe code aan op ROUT.");
        }
        return Response.json({ ok: true, verified });
      },
    },
  },
});
