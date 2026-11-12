/**
 * The signed-in member's own private ROUT card: root card payload, wallet key
 * serial and lifecycle state in one place, so every owner action checks the same facts.
 */
import type { CardState } from "./card-lifecycle";

export async function myRootCard(userId: string) {
  const { generateWalletPayload } = await import("./wallet-payload.server");
  const card = await generateWalletPayload(userId, { space: "root", allowAccountId: true }).catch(() => null);
  if (!card || card.space !== "root") return null;
  const { cardGeneration, cardStatus } = await import("./card-freeze.server");
  const generation = await cardGeneration(userId);
  const { walletKeyPayload } = await import("./wallet-key.server");
  const key = await walletKeyPayload(userId, process.env["WALLET_ID_SECRET"], Date.now(), generation);
  const [cardState, keyState] = await Promise.all([cardStatus(card.serial), key ? cardStatus(key.serial) : Promise.resolve("active" as const)]);
  // The strictest of card and key wins: a blocked key means a blocked card.
  const rank = { active: 0, frozen: 1, blocked: 2, unavailable: 3 } as const;
  const state: CardState = rank[keyState] > rank[cardState] ? keyState : cardState;
  return { card, generation, keySerial: key?.serial ?? null, state };
}

/** 2FA (passkey, authenticator app or verified SMS) is required for every private card action. */
export async function memberHasTwoFactor(userId: string): Promise<boolean> {
  const { enrolledFactors } = await import("@/lib/auth/step-up.server");
  const { hasSecondFactor } = await import("@/lib/auth/step-up-rules");
  const enrolled = await enrolledFactors(userId).catch((e: unknown) => {
    // Fail closed, but never silently: a broken lookup must not look like "no 2FA" in the logs.
    console.error("[card] second-factor lookup failed", e instanceof Error ? e.message : e);
    return { passkey: false, totp: false };
  });
  return hasSecondFactor(enrolled);
}
