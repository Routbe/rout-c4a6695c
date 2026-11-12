import { createHmac } from "node:crypto";

function secret(): string {
  const value =
    process.env["GO_LINK_SECRET"] ||
    process.env["APP_SESSION_SECRET"] ||
    process.env["BETTER_AUTH_SECRET"] ||
    process.env["DATABASE_URL"];
  if (!value) throw new Error("GO_LINK_SECRET ontbreekt.");
  return value;
}

export function signValueRaw(payload: string): string {
  return createHmac("sha256", `rout-go:${secret()}`).update(payload).digest("base64url").slice(0, 32);
}
