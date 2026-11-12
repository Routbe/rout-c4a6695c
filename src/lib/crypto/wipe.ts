/**
 * Best-effort memory wiping for key material and plaintext held in typed arrays.
 * Zero-fill the owned view, including when randomness is unavailable.
 *
 * Limits (by design of JavaScript engines): JS strings are immutable and cannot
 * be wiped, and the engine may have made internal copies we cannot reach. Wipe
 * every typed array you own as soon as the operation that needed it finishes.
 */
export function wipe(...buffers: Array<ArrayBufferView | ArrayBuffer | null | undefined>): void {
  for (const b of buffers) {
    if (!b) continue;
    try {
      const view = ArrayBuffer.isView(b)
        ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
        : new Uint8Array(b);
      view.fill(0);
    } catch {
      // A transferred buffer is detached and has no accessible bytes to wipe.
    }
  }
}

/** Covers malformed requests too, without relying on a handler reaching its finally. */
export function wipeMessage(value: unknown, seen = new Set<object>()): void {
  const pending = [value];
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    try {
      if (ArrayBuffer.isView(current) || current instanceof ArrayBuffer) {
        wipe(current);
      } else if (current instanceof Map) {
        for (const [key, child] of current) pending.push(key, child);
      } else if (current instanceof Set) {
        for (const child of current) pending.push(child);
      } else {
        // Do not invoke getters while cleaning up an untrusted local request.
        for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(current))) {
          if ("value" in descriptor) pending.push(descriptor.value);
        }
      }
    } catch {
      // Cleanup must never replace sanitized errors (e.g. a hostile Proxy).
    }
  }
}
