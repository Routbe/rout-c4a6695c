/**
 * Maps a step-up proof id (22 base64url chars = 128 bits, see newStepUpJti)
 * onto the uuid the vault enclave stores it as. Bijective, so the same proof
 * is the same row and can be spent exactly once.
 */
const JTI = /^[A-Za-z0-9_-]{22}$/;

export function stepUpProofId(jti: string): string {
  if (!JTI.test(jti)) throw new TypeError("step_up_jti_invalid");
  const bin = atob(jti.replace(/-/g, "+").replace(/_/g, "/") + "==");
  if (bin.length !== 16) throw new TypeError("step_up_jti_invalid");
  let hex = "";
  for (let i = 0; i < 16; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
