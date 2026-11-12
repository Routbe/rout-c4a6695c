/** True when the member has a verified root profile (the wallet payload resolves only for verified, public profiles). */
export async function isVerifiedMember(userId: string): Promise<boolean> {
  const { generateWalletPayload } = await import("./wallet-payload.server");
  const root = await generateWalletPayload(userId, { space: "root", allowAccountId: true }).catch(() => null);
  return root?.space === "root";
}
