/**
 * Export performance telemetry: heap guard, precise timing and structured
 * logging. Everything degrades silently on engines without `performance.memory`
 * (Firefox, Safari) — telemetry may never be the reason an export fails.
 */

interface HeapReading {
  usedMB: number;
  limitMB: number;
  /** Fraction of the JS heap limit currently in use (0–1). */
  pressure: number;
  supported: boolean;
}

type PerfMemory = { usedJSHeapSize: number; jsHeapSizeLimit: number };

/** Abort a heavy render above this heap pressure rather than risk an OOM tab crash. */
export const HEAP_ABORT_PRESSURE = 0.9;

export function readHeap(): HeapReading {
  try {
    const mem = (performance as Performance & { memory?: PerfMemory }).memory;
    if (!mem || !mem.jsHeapSizeLimit) {
      return { usedMB: 0, limitMB: 0, pressure: 0, supported: false };
    }
    return {
      usedMB: mem.usedJSHeapSize / 1048576,
      limitMB: mem.jsHeapSizeLimit / 1048576,
      pressure: mem.usedJSHeapSize / mem.jsHeapSizeLimit,
      supported: true,
    };
  } catch {
    return { usedMB: 0, limitMB: 0, pressure: 0, supported: false };
  }
}

/** Ask the engine to collect, when a build exposes it (devtools / --expose-gc). */
export function requestGC(): void {
  try {
    (globalThis as { gc?: () => void }).gc?.();
  } catch {
    /* not available — nothing to do */
  }
}

/**
 * Pre-render guard. Returns a reason string when the export must be aborted so
 * the caller can surface a toast instead of letting the tab die.
 */
export function guardHeapBeforeExport(estimatedPixels: number): string | null {
  const heap = readHeap();
  if (!heap.supported) return null;
  // Each canvas pixel is 4 bytes, and the decode + encode stages hold roughly
  // two copies at once.
  const projectedMB = (estimatedPixels * 4 * 2) / 1048576;
  const projectedPressure = (heap.usedMB + projectedMB) / heap.limitMB;
  if (heap.pressure >= HEAP_ABORT_PRESSURE || projectedPressure >= 1) {
    requestGC();
    const after = readHeap();
    if (
      after.pressure >= HEAP_ABORT_PRESSURE ||
      (after.usedMB + projectedMB) / after.limitMB >= 1
    ) {
      return `Not enough memory for this export (${Math.round(projectedMB)} MB needed, ${Math.round(after.limitMB - after.usedMB)} MB free). Lower the print size or DPI and try again.`;
    }
  }
  return null;
}

export interface ExportTelemetry {
  format: string;
  renderTimeMs: number;
  peakMemoryMB: number;
  nodeCount: number;
  deviceMemory: number | string;
  timestamp: string;
}

/** Start a high-precision profile; call the returned function when done. */
export function startExportProfile(format: string, nodeCount = 0) {
  const t0 = performance.now();
  const before = readHeap();
  return (
    outcome: "success" | "failure" | "cancelled" = "success",
    nodes = nodeCount,
  ): ExportTelemetry => {
    const after = readHeap();
    const telemetry: ExportTelemetry = {
      format,
      renderTimeMs: Math.round((performance.now() - t0) * 100) / 100,
      peakMemoryMB: Math.round(Math.max(0, after.usedMB - before.usedMB) * 100) / 100,
      nodeCount: nodes,
      deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? "unknown",
      timestamp: new Date().toISOString(),
    };
    console.log("[ROUT Telemetry]", { ...telemetry, outcome });
    return telemetry;
  };
}

/** Count the drawable nodes in an SVG string, for the telemetry payload. */
export function countSvgNodes(svg: string | null | undefined): number {
  if (!svg) return 0;
  return (svg.match(/<(path|rect|circle|ellipse|polygon|line|g)\b/g) ?? []).length;
}
