/**
 * Shamir secret sharing over GF(2^8) (AES polynomial 0x11b), byte-wise.
 *
 * Arithmetic is branch-free and table-free (no secret-indexed lookups), so
 * timing does not depend on secret bytes. Share x-coordinates are 1..255 and
 * public. Any `threshold` distinct shares reconstruct; fewer reveal nothing.
 */

/** Constant-time GF(256) multiply (Russian peasant with masks). */
export function gfMul(a: number, b: number): number {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    p ^= -(b & 1) & a;
    const hi = -((a >> 7) & 1) & 0x1b;
    a = ((a << 1) & 0xff) ^ hi;
    b >>= 1;
  }
  return p & 0xff;
}

/** Inverse via a^254 (fixed 8-step ladder; inv(0) = 0, never used for valid x). */
export function gfInv(a: number): number {
  let r = 1;
  let base = a;
  let e = 254;
  for (let i = 0; i < 8; i++) {
    const m = -(e & 1);
    const prod = gfMul(r, base);
    r = (prod & m) | (r & ~m & 0xff);
    base = gfMul(base, base);
    e >>= 1;
  }
  return r & 0xff;
}

export type Share = { x: number; y: Uint8Array };

/**
 * Splits `secret` into `count` shares, any `threshold` of which reconstruct it.
 * `random` is injectable for known-answer tests; production uses crypto RNG.
 */
export function split(
  secret: Uint8Array,
  threshold: number,
  count: number,
  random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): Share[] {
  if (!Number.isInteger(threshold) || !Number.isInteger(count) || threshold < 2 || count < threshold || count > 255) {
    throw new Error("invalid_threshold");
  }
  if (secret.length === 0) throw new Error("empty_secret");
  const coeffs = random(secret.length * (threshold - 1));
  if (coeffs.length !== secret.length * (threshold - 1)) throw new Error("rng_failed");
  try {
    const shares: Share[] = [];
    for (let x = 1; x <= count; x++) {
      const y = new Uint8Array(secret.length);
      for (let i = 0; i < secret.length; i++) {
        // Horner: f(x) = s + c1 x + c2 x^2 + ...
        let acc = 0;
        for (let k = threshold - 2; k >= 0; k--) acc = gfMul(acc, x) ^ coeffs[i * (threshold - 1) + k]!;
        y[i] = gfMul(acc, x) ^ secret[i]!;
      }
      shares.push({ x, y });
    }
    return shares;
  } finally {
    coeffs.fill(0);
  }
}

/** Lagrange interpolation at x = 0. Caller decides how many shares are required. */
export function combine(shares: Share[]): Uint8Array {
  if (shares.length < 2) throw new Error("not_enough_shares");
  const len = shares[0]!.y.length;
  const xs = new Set<number>();
  for (const s of shares) {
    if (s.y.length !== len || !Number.isInteger(s.x) || s.x < 1 || s.x > 255 || xs.has(s.x)) throw new Error("invalid_share");
    xs.add(s.x);
  }
  const out = new Uint8Array(len);
  for (let j = 0; j < shares.length; j++) {
    let num = 1;
    let den = 1;
    for (let m = 0; m < shares.length; m++) {
      if (m === j) continue;
      num = gfMul(num, shares[m]!.x);
      den = gfMul(den, shares[m]!.x ^ shares[j]!.x);
    }
    const basis = gfMul(num, gfInv(den));
    const yj = shares[j]!.y;
    for (let i = 0; i < len; i++) out[i] ^= gfMul(yj[i]!, basis);
  }
  return out;
}
