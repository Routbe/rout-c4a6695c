/**
 * Public lookup behind the printed metal-card QR. Returns only non-sensitive
 * identity data and the live kill-switch state. `authenticates` is always
 * false: this result must never open a gate, sign a payment or log anyone in.
 */
export type PhysicalLookup =
  | { channel: "physical-public"; authenticates: false; status: "active" | "blocked" | "unknown"; display_name: string; avatar_url: string | null }
  | { channel: "physical-public"; authenticates: false; status: "not_found" };

export async function lookupPhysicalCard(cardId: string): Promise<PhysicalLookup> {
  const { isPublicCardIdShape } = await import("./scan-channel");
  const notFound = { channel: "physical-public", authenticates: false, status: "not_found" } as const;
  if (!isPublicCardIdShape(cardId)) return notFound;
  const { livenessKey } = await import("./card-liveness.server");
  const { openPublicCardId } = await import("./card-public-id");
  const opened = await openPublicCardId(await livenessKey(), cardId);
  if (!opened) return notFound;
  const { generateWalletPayload } = await import("./wallet-payload.server");
  const card = await generateWalletPayload(opened.accountId, { space: opened.space, allowAccountId: true });
  if (!card) return notFound;
  const { cardStatus } = await import("./card-freeze.server");
  const s = await cardStatus(card.serial);
  return {
    channel: "physical-public",
    authenticates: false,
    status: s === "active" ? "active" : s === "frozen" ? "blocked" : "unknown",
    display_name: card.displayName,
    avatar_url: card.heroImageUrl,
  };
}
