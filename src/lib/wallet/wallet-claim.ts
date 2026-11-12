/** A claim must be for the current account's server-resolved card, never a supplied account ID. */
export function canClaimWalletCard(own: { handle: string; space: "root" | "alias" } | null, requestedHandle: string, requestedSpace?: "root" | "alias"): boolean {
  return Boolean(own && own.handle.toLowerCase() === requestedHandle.replace(/^@/, "").toLowerCase() && (!requestedSpace || own.space === requestedSpace));
}