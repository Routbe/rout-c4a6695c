/** Exact comparison deliberately does not fold case, accents or punctuation. */
export function bankIdentityStatus(holder: string | null, verifiedName: string | null, verified: boolean) {
  if (!verified || !verifiedName || !holder) return "unverified" as const;
  return holder === verifiedName ? "match" as const : "mismatch" as const;
}

export function webhookHealth(status: string) {
  if (["success", "done", "processed", "ok"].includes(status)) return "success" as const;
  if (["failed", "error"].includes(status)) return "failed" as const;
  return "pending" as const;
}