import { SignJWT, jwtVerify } from "jose";

const audience = "rout:notification-unsubscribe:v1";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = (secret: string) => new TextEncoder().encode(secret);

export async function signUnsubscribeToken(userId: string, secret: string) {
  if (!uuid.test(userId) || secret.length < 32) throw new Error("Invalid unsubscribe configuration");
  return new SignJWT({ scope: "notifications" }).setProtectedHeader({ alg: "HS256" })
    .setSubject(userId).setAudience(audience).setIssuer("ROUT").setIssuedAt().setExpirationTime("180d").sign(key(secret));
}

export async function verifyUnsubscribeToken(token: string, secret: string): Promise<string | null> {
  if (secret.length < 32 || token.length > 2048) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"], audience, issuer: "ROUT" });
    return payload.scope === "notifications" && typeof payload.sub === "string" && uuid.test(payload.sub) ? payload.sub : null;
  } catch { return null; }
}

/** Essential identity, security and payment mail must not be accidentally disabled. */
export function canUnsubscribeNotification(category: string | undefined, tags: string[] = []) {
  return category === "node_expiry" && tags.some((tag) => tag.startsWith("notification:"));
}

export function unsubscribeHeaders(origin: string, token: string) {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Unsafe email origin");
  const target = new URL("/api/public/email/unsubscribe", url.origin);
  target.searchParams.set("token", token);
  return { "List-Unsubscribe": `<${target.href}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}