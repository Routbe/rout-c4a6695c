export function validBookingToken(token: string | null | undefined, stored: string | null | undefined): boolean {
  if (!token || !stored || !/^[a-f0-9]{64}$/.test(token) || token.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}