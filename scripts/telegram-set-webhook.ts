/**
 * Registreert de Telegram-webhook. Gebruik:
 *   TELEGRAM_BOT_TOKEN=... bun scripts/telegram-set-webhook.ts [https://rout.be]
 * Het secret_token wordt op dezelfde manier afgeleid als in de webhook-route,
 * dus er is geen extra geheim nodig. Het token wordt nooit gelogd.
 */
const token = process.env["TELEGRAM_BOT_TOKEN"];
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN ontbreekt.");
  process.exit(1);
}
const base = (process.argv[2] ?? "https://rout.be").replace(/\/$/, "");
const url = `${base}/api/public/telegram/webhook`;

const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`telegram-webhook:${token}`));
const secretToken = btoa(String.fromCharCode(...new Uint8Array(digest)))
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url, secret_token: secretToken, allowed_updates: ["message"], drop_pending_updates: true }),
});
const body = (await res.json()) as { ok: boolean; description?: string };
console.log(body.ok ? `Webhook actief: ${url}` : `Mislukt [${res.status}]: ${body.description ?? "onbekend"}`);
process.exit(body.ok ? 0 : 1);
