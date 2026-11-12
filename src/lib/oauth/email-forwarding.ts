/**
 * Private relay addresses for "Login met ROUT" (pure, browser-safe).
 * An app can receive `priv-<id>@mail.rout.be`; inbound mail to that address is
 * forwarded to the member's verified email. The id is derived from the app's
 * pairwise subject, so two apps never share an address for the same person.
 */
import type { RateRule } from "@/lib/rate-limit-rules";

export const FORWARD_DOMAIN_DEFAULT = "mail.rout.be";
export const FORWARD_MAX_BYTES = 10 * 1024 * 1024;
/** Per relay address, shared over all instances. */
export const FORWARD_RATE: RateRule = { limit: 50, windowSec: 3600 };
const ALIAS_RE = /^priv-[a-f0-9]{20}$/;

async function sha256Hex(value: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Relay local part from a pairwise subject (already app-specific and secret-derived). */
export async function forwardAliasLocal(pairwise: string): Promise<string> {
  if (!pairwise || pairwise.length < 16) throw new Error("invalid_pairwise");
  return `priv-${(await sha256Hex(`relay|${pairwise}`)).slice(0, 20)}`;
}

/** Returns the relay local part when `address` is one of ours, otherwise null. */
export function parseForwardAddress(address: string, domain = FORWARD_DOMAIN_DEFAULT): string | null {
  const m = /^\s*(?:[^<]*<)?([^<>\s@]+)@([^<>\s@]+?)>?\s*$/.exec(address ?? "");
  if (!m) return null;
  const local = m[1]!.toLowerCase().split("+")[0]!;
  if (m[2]!.toLowerCase() !== domain.toLowerCase()) return null;
  return ALIAS_RE.test(local) ? local : null;
}

/** Hash of the Message-ID for retry de-duplication (the id itself is never stored). */
export async function messageIdHash(messageId: string | null | undefined): Promise<string | null> {
  const v = (messageId ?? "").trim();
  return v ? sha256Hex(v.toLowerCase()) : null;
}

export type ForwardRule = { status: "active" | "paused" | "revoked" } | null;
export type ForwardInput = {
  rule: ForwardRule;
  targetEmail: string | null;
  targetVerified: boolean;
  fromAddress: string;
  sizeBytes: number;
  duplicate: boolean;
  rateOk: boolean;
  domain?: string;
};
export type ForwardReason =
  | "unknown_alias"
  | "inactive"
  | "unverified_target"
  | "loop"
  | "too_large"
  | "duplicate"
  | "rate_limited";
export type ForwardDecision = { action: "forward" } | { action: "reject"; reason: ForwardReason };

/** Order matters: unknown/inactive first so nothing about the member leaks into later checks. */
export function decideForward(i: ForwardInput): ForwardDecision {
  const domain = (i.domain ?? FORWARD_DOMAIN_DEFAULT).toLowerCase();
  if (!i.rule) return { action: "reject", reason: "unknown_alias" };
  if (i.rule.status !== "active") return { action: "reject", reason: "inactive" };
  if (!i.targetEmail || !i.targetVerified) return { action: "reject", reason: "unverified_target" };
  const fromDomain = i.fromAddress.toLowerCase().split("@")[1]?.replace(/>.*$/, "") ?? "";
  if (fromDomain === domain || i.targetEmail.toLowerCase().endsWith(`@${domain}`)) return { action: "reject", reason: "loop" };
  if (i.sizeBytes > FORWARD_MAX_BYTES) return { action: "reject", reason: "too_large" };
  if (i.duplicate) return { action: "reject", reason: "duplicate" };
  if (!i.rateOk) return { action: "reject", reason: "rate_limited" };
  return { action: "forward" };
}
