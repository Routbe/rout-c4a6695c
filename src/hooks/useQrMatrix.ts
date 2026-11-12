import { useEffect, useRef, useState } from "react";
import type { QrWorkerRequest, QrWorkerResponse } from "@/lib/qr.worker";

export interface QrMatrix {
  count: number;
  path: string;
  /** Matrix rows as '0'/'1' strings (empty when nothing is encoded). */
  bits: string[];
}

/**
 * Encode a QR payload in a background Web Worker, with a synchronous
 * main-thread fallback for browsers (or SSR hydration paths) where module
 * workers are unavailable. Results are latest-wins and debounced so fast
 * typing never queues up stale work.
 */
export function useQrMatrix(value: string, ecc: QrWorkerRequest["ecc"] = "H"): QrMatrix {
  const workerRef = useRef<Worker | null>(null);
  const latestId = useRef(0);
  const [matrix, setMatrix] = useState<QrMatrix>({ count: 0, path: "", bits: [] });

  useEffect(() => {
    if (typeof window === "undefined" || typeof Worker === "undefined") return;
    let worker: Worker;
    try {
      worker = new Worker(new URL("../lib/qr.worker.ts", import.meta.url), { type: "module" });
    } catch {
      // Worker construction blocked (CSP, old browser) — fallback handles it.
      return;
    }
    worker.onmessage = (event: MessageEvent<QrWorkerResponse>) => {
      if (event.data.id !== latestId.current) return;
      setMatrix({
        count: event.data.count,
        path: event.data.path,
        bits: event.data.bits ?? [],
      });
    };
    worker.onerror = () => {
      worker.terminate();
      workerRef.current = null;
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const id = window.setTimeout(async () => {
      latestId.current += 1;
      const requestId = latestId.current;
      const worker = workerRef.current;
      if (worker) {
        worker.postMessage({ id: requestId, value, ecc } satisfies QrWorkerRequest);
        return;
      }
      if (!value) {
        setMatrix({ count: 0, path: "", bits: [] });
        return;
      }
      const next = await encodeOnMainThread(value, ecc);
      if (!cancelled && requestId === latestId.current) setMatrix(next);
    }, 30);

    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [value, ecc]);

  return matrix;
}

/** Same maths as the worker, run inline when no worker is available. */
async function encodeOnMainThread(value: string, ecc: QrWorkerRequest["ecc"]): Promise<QrMatrix> {
  try {
    const { default: qrcode } = await import("qrcode-generator");
    const qr = qrcode(0, ecc ?? "H");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    const bits: string[] = [];
    for (let r = 0; r < count; r += 1) {
      let run = 0;
      let row = "";
      for (let c = 0; c <= count; c += 1) {
        const dark = c < count && qr.isDark(r, c);
        if (c < count) row += dark ? "1" : "0";
        if (dark) run += 1;
        else if (run) {
          d += `M${c - run} ${r}h${run}v1h-${run}z`;
          run = 0;
        }
      }
      bits.push(row);
    }
    return { count, path: d, bits };
  } catch {
    return { count: 0, path: "", bits: [] };
  }
}
