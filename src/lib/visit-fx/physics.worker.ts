/// <reference lib="webworker" />
import { STRIDE, type WorkerMsg } from "./protocol";
import { VisitWorld } from "./physics-core";

let world: VisitWorld | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let last = 0;
const scope = self as unknown as DedicatedWorkerGlobalScope;

function loop() {
  if (!world) return;
  const now = performance.now();
  const dt = Math.min(48, now - last); last = now;
  const n = world.step(dt);
  const data = world.out.slice(0, n * STRIDE);
  scope.postMessage({ type: "frame", data, count: n }, [data.buffer]);
  if (world.finished(n)) { scope.postMessage({ type: "done" }); world = null; return; }
  timer = setTimeout(loop, 16);
}

scope.onmessage = (e: MessageEvent<WorkerMsg>) => {
  const m = e.data;
  if (m.type === "init") { world = new VisitWorld(m); last = performance.now(); loop(); }
  else if (m.type === "bodies") world?.setBodies(m.bodies, m.width, m.height, m.floor, m.pageHeight);
  else { world = null; if (timer) clearTimeout(timer); }
};
