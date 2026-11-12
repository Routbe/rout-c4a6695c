/** Factory-written public NDEF tag. Never import keys from an untrusted tag. */
export type PairingState = "idle" | "scanning" | "verifying" | "success" | "error";
export type PairingEvent = "scan" | "detected" | "verify" | "verified" | "fail" | "cancel";
export function pairingTransition(state: PairingState, event: PairingEvent): PairingState {
  if (event === "cancel") return "idle";
  if (event === "scan" && state !== "verifying") return "scanning";
  if (event === "detected" && state === "scanning") return "idle";
  if (event === "verify" && state !== "verifying") return "verifying";
  if (event === "verified" && state === "verifying") return "success";
  if (event === "fail" && (state === "scanning" || state === "verifying")) return "error";
  return state;
}

export function readHardwareId(record: string): string | null {
  const match = /^rout-hw:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(record.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

export function canPairFactoryKey(key: { status: string; userId: string | null; publicKey: string | null; activationMatches: boolean }): boolean {
  return key.status === "pending" && key.userId === null && Boolean(key.publicKey) && key.activationMatches;
}