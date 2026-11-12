/**
 * Provider-neutral SMS sender. The Android gateway is the primary choice;
 * Twilio and Brevo are drop-in alternatives. Without keys `getSmsSender()`
 * returns null and nothing is ever sent.
 */
export type SmsProviderId = "android-gateway" | "twilio" | "brevo";

export interface SmsSender {
  id: SmsProviderId;
  send(to: string, text: string): Promise<void>;
}

const env = (k: string) => process.env[k]?.trim() || undefined;

export function smsProviderId(): SmsProviderId {
  const v = env("SMS_PROVIDER");
  return v === "twilio" || v === "brevo" ? v : "android-gateway";
}

export function missingSmsKeys(): string[] {
  const need: Record<SmsProviderId, string[]> = {
    "android-gateway": env("SMS_GATEWAY_USER") && env("SMS_GATEWAY_PASSWORD") ? [] : env("SMS_API_KEY") ? [] : ["SMS_GATEWAY_USER", "SMS_GATEWAY_PASSWORD"],
    twilio: ["SMS_API_KEY", "SMS_SENDER_ID"],
    brevo: ["SMS_API_KEY", "SMS_SENDER_ID"],
  };
  return [...need[smsProviderId()], "PHONE_ENCRYPTION_KEY"].filter((k) => !env(k));
}

async function ensureOk(res: Response, label: string) {
  if (!res.ok) {
    console.error(`[sms] ${label} failed`, res.status, (await res.text()).slice(0, 200));
    throw new Error("sms_send_failed");
  }
}

/** sms-gate.app: base URL → /3rdparty/v1/message (cloud and local). */
export function resolveGatewayUrl(raw: string): string {
  const t = raw.trim().replace(/\/+$/, "");
  return t.endsWith("/message") ? t : `${t}/3rdparty/v1/message`;
}

/** Basic auth for login:password (or SMS_GATEWAY_USER/PASSWORD), else Bearer. */
export function resolveGatewayAuth(): string {
  const user = env("SMS_GATEWAY_USER");
  const pass = env("SMS_GATEWAY_PASSWORD");
  if (user && pass) return `Basic ${btoa(`${user}:${pass}`)}`;
  const key = env("SMS_API_KEY") ?? "";
  return key.includes(":") ? `Basic ${btoa(key)}` : `Bearer ${key}`;
}

export function getSmsSender(): SmsSender | null {
  if (missingSmsKeys().length) return null;
  const id = smsProviderId();
  const key = env("SMS_API_KEY") ?? "";
  const from = env("SMS_SENDER_ID");
  if (id === "android-gateway") {
    const url = resolveGatewayUrl(env("SMS_GATEWAY_URL") ?? "https://api.sms-gate.app");
    const auth = resolveGatewayAuth();
    const deviceId = env("SMS_GATEWAY_DEVICE_ID") ?? from;
    return {
      id,
      async send(to, text) {
        // sms-gate.app v1 requires `textMessage: { text }`; a bare `message` is rejected (400).
        const payload: Record<string, unknown> = { phoneNumbers: [to], textMessage: { text } };
        if (deviceId) payload.deviceId = deviceId;
        const res = await fetch(url, {
          method: "POST",
          headers: { authorization: auth, "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        await ensureOk(res, `android-gateway ${url}`);
      },
    };
  }
  if (id === "twilio") {
    // SMS_API_KEY = "<AccountSID>:<AuthToken>"
    const [sid, token] = key.split(":");
    return {
      id,
      async send(to, text) {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: "POST",
          headers: { authorization: `Basic ${btoa(`${sid}:${token}`)}`, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ To: to, From: from!, Body: text }),
        });
        await ensureOk(res, "twilio");
      },
    };
  }
  return {
    id,
    async send(to, text) {
      const res = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
        method: "POST",
        headers: { "api-key": key, "content-type": "application/json" },
        body: JSON.stringify({ sender: from, recipient: to, content: text, type: "transactional" }),
      });
      await ensureOk(res, "brevo");
    },
  };
}
