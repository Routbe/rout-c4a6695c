/**
 * OIDC back-channel email sync: sends a signed `user.email_updated` event to the
 * app's registered webhook. Secrets are sealed (AES-256-GCM, key derived from the
 * provider KEK); URLs must pass `webhookUrlAllowed` (https, no private hosts).
 */
import { sql } from "@/lib/neon";
import { emailUpdatedEvent, signWebhook, webhookUrlAllowed, type BulkChange } from "@/lib/oauth/backchannel";
import type { WebhookDelivery } from "@/lib/oauth/email-push";
import { assertPublicHost } from "@/lib/safe-fetch.server";

const LABEL = "rout:backchannel-webhook:v1:";
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (v: string) => Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function dataKey(clientId: string): Promise<CryptoKey> {
  const { currentKek } = await import("@/lib/oauth/key-seal.server");
  const kek = await currentKek();
  const mac = await crypto.subtle.importKey("raw", enc.encode(kek.material), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const raw = new Uint8Array(await crypto.subtle.sign("HMAC", mac, enc.encode(LABEL + clientId)));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function sealWebhookSecret(clientId: string, secret: string): Promise<{ sealed: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(LABEL + clientId) }, await dataKey(clientId), enc.encode(secret));
  return { sealed: b64u(new Uint8Array(ct)), iv: b64u(iv) };
}

async function openWebhookSecret(clientId: string, sealed: string, iv: string): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64u(iv) as BufferSource, additionalData: enc.encode(LABEL + clientId) },
    await dataKey(clientId),
    unb64u(sealed) as BufferSource,
  );
  return dec.decode(pt);
}

/** Developer setting: register (or clear with null) the webhook. Returns the new secret once. */
export async function setBackchannelWebhook(clientId: string, url: string | null): Promise<{ secret: string | null }> {
  if (url === null) {
    await sql`update public.oauth_clients set backchannel_webhook_url = null, backchannel_webhook_secret_sealed = null,
      backchannel_webhook_secret_iv = null, updated_at = now() where client_id = ${clientId}`;
    return { secret: null };
  }
  if (!webhookUrlAllowed(url)) throw new Error("Webhook-URL moet https zijn en mag niet naar een intern adres wijzen.");
  if (!(await assertPublicHost(new URL(url).hostname))) throw new Error("Webhook-host is niet publiek bereikbaar.");
  const secret = `whsec_${b64u(crypto.getRandomValues(new Uint8Array(32)))}`;
  const { sealed, iv } = await sealWebhookSecret(clientId, secret);
  await sql`update public.oauth_clients set backchannel_webhook_url = ${url}, backchannel_webhook_secret_sealed = ${sealed},
    backchannel_webhook_secret_iv = ${iv}, updated_at = now() where client_id = ${clientId}`;
  return { secret };
}

/** Sends one event per changed app. Never throws; failures are logged without URL or body. */
export async function dispatchEmailUpdated(userId: string, changes: BulkChange[]): Promise<void> {
  await deliverEmailUpdated(userId, changes);
}

/**
 * Same delivery, but reports per app: `ok` (2xx), `failed`, or `none` (no webhook
 * registered or no email consent). Never throws.
 */
export async function deliverEmailUpdated(userId: string, changes: BulkChange[]): Promise<Map<string, WebhookDelivery>> {
  const result = new Map<string, WebhookDelivery>(changes.map((c) => [c.clientId, "none"]));
  if (!changes.length) return result;
  const ids = changes.map((c) => c.clientId);
  const rows = (await sql`select client_id, backchannel_webhook_url, backchannel_webhook_secret_sealed, backchannel_webhook_secret_iv
    from public.oauth_clients c where client_id = any(${ids}) and backchannel_webhook_url is not null
      and exists (select 1 from public.oauth_consents k where k.user_id = ${userId} and k.client_id = c.client_id
        and k.revoked_at is null and 'email' = any(k.scopes))`) as Record<string, unknown>[];
  const { getPairwiseSubject } = await import("./oidc-identifiers.server");
  await Promise.all(rows.map(async (r) => {
    const clientId = String(r["client_id"]);
    const change = changes.find((c) => c.clientId === clientId);
    const url = String(r["backchannel_webhook_url"]);
    if (!change || !webhookUrlAllowed(url)) return;
    result.set(clientId, "failed");
    try {
      if (!(await assertPublicHost(new URL(url).hostname))) return;
      const secret = await openWebhookSecret(clientId, String(r["backchannel_webhook_secret_sealed"]), String(r["backchannel_webhook_secret_iv"]));
      const now = Math.floor(Date.now() / 1000);
      const body = JSON.stringify(emailUpdatedEvent(await getPairwiseSubject(userId, clientId), change.previousEmail || null, change.newEmail, now));
      const res = await fetch(url, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/json", "x-rout-event": "user.email_updated", "x-rout-signature": await signWebhook(secret, body, now) },
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) console.warn(`[backchannel] ${clientId} answered ${res.status}`);
      else result.set(clientId, "ok");
    } catch (e) {
      console.warn(`[backchannel] ${clientId} failed`, e instanceof Error ? e.name : "error");
    }
  }));
  return result;
}
