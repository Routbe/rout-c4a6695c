/// <reference lib="webworker" />
/**
 * QR matrix worker.
 *
 * All QR encoding maths (Reed-Solomon, masking, module placement) and the
 * SVG path serialisation happen here, off the main thread, so typing in the
 * generator or the Studio never blocks paint — the UI stays at 60 FPS even on
 * low-end phones.
 */
import qrcode from "qrcode-generator";

export interface QrWorkerRequest {
  id: number;
  value: string;
  /** Error correction level, defaults to the scan-safe 'H'. */
  ecc?: "L" | "M" | "Q" | "H";
}

export interface QrWorkerResponse {
  id: number;
  /** Number of modules per side (0 when the payload is empty/invalid). */
  count: number;
  /** SVG path data drawn in a `0 0 count count` viewBox. */
  path: string;
  /** Raw matrix rows as '0'/'1' strings — used by the artistic renderer. */
  bits: string[];
  error?: string;
}

/** Serialise the module matrix into a single, compact SVG path. */
function toPath(isDark: (r: number, c: number) => boolean, count: number): string {
  let d = "";
  for (let r = 0; r < count; r += 1) {
    let run = 0;
    for (let c = 0; c <= count; c += 1) {
      const dark = c < count && isDark(r, c);
      if (dark) {
        run += 1;
      } else if (run) {
        d += `M${c - run} ${r}h${run}v1h-${run}z`;
        run = 0;
      }
    }
  }
  return d;
}

/** Serialise the matrix into compact '0'/'1' rows. */
function toBits(isDark: (r: number, c: number) => boolean, count: number): string[] {
  const rows: string[] = [];
  for (let r = 0; r < count; r += 1) {
    let row = "";
    for (let c = 0; c < count; c += 1) row += isDark(r, c) ? "1" : "0";
    rows.push(row);
  }
  return rows;
}

self.onmessage = (event: MessageEvent<QrWorkerRequest>) => {
  const { id, value, ecc = "H" } = event.data;
  if (!value) {
    (self as unknown as Worker).postMessage({
      id,
      count: 0,
      path: "",
      bits: [],
    } satisfies QrWorkerResponse);
    return;
  }
  try {
    const qr = qrcode(0, ecc);
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    (self as unknown as Worker).postMessage({
      id,
      count,
      path: toPath((r, c) => qr.isDark(r, c), count),
      bits: toBits((r, c) => qr.isDark(r, c), count),
    } satisfies QrWorkerResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id,
      count: 0,
      path: "",
      bits: [],
      error: err instanceof Error ? err.message : "QR encode failed",
    } satisfies QrWorkerResponse);
  }
};
