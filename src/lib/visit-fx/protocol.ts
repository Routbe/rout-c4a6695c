/** Gedeeld berichtformaat tussen main thread en physics worker. */
export const STRIDE = 7; // x, y, rotation, squash, alpha, texture, size
export type Body = [x: number, y: number, w: number, h: number];
export type WorkerInit = {
  type: "init";
  width: number; height: number; floor: number;
  amount: number; textures: number;
  direction: "down" | "up" | "diagonal" | "burst";
  fade: boolean; floorMode: "through" | "vanish" | "bounce" | "splat";
  rampInMs: number; rampOutMs: number; totalMs: number;
  bodies: Body[];
  /** Absolute wereld (paginacoördinaten). cameraY = scrollY bij start, alleen als spawn-oorsprong.
   *  floor en pageHeight zijn absolute paginacoördinaten; scrollen wordt nooit naar de worker gestuurd. */
  cameraY?: number;
  pageHeight?: number;
};
export type WorkerMsg =
  | WorkerInit
  | { type: "bodies"; bodies: Body[]; width: number; height: number; floor: number; pageHeight: number }
  | { type: "stop" };
export type FrameMsg = { type: "frame"; data: Float32Array; count: number } | { type: "done" };
