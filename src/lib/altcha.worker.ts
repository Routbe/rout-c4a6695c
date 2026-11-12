/// <reference lib="webworker" />
/** Solves an ALTCHA SHA-256 challenge off the main thread. */
self.onmessage = async (event: MessageEvent<{ challenge: string; salt: string; maxnumber: number }>) => {
  const { challenge, salt, maxnumber } = event.data;
  const encoder = new TextEncoder();
  for (let n = 0; n <= maxnumber; n++) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(salt + n)));
    let hex = "";
    for (let i = 0; i < digest.length; i++) hex += digest[i]!.toString(16).padStart(2, "0");
    if (hex === challenge) {
      (self as unknown as Worker).postMessage({ number: n });
      return;
    }
  }
  (self as unknown as Worker).postMessage({ number: null });
};
