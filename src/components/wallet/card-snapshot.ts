/** Capture within the renderer's current context, before WebGL clears its buffer. */
export const SNAPSHOT_PIXEL_RATIO = 3;
type SnapshotRenderer<S, C> = {
  getPixelRatio: () => number;
  setPixelRatio: (ratio: number) => void;
  render: (scene: S, camera: C) => void;
  domElement: { toDataURL: (type: string) => string };
};

export function captureCardSnapshot<S, C>(renderer: SnapshotRenderer<S, C>, scene: S, camera: C): string {
  const previousRatio = renderer.getPixelRatio();
  try {
    renderer.setPixelRatio(SNAPSHOT_PIXEL_RATIO);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  } finally {
    renderer.setPixelRatio(previousRatio);
    renderer.render(scene, camera);
  }
}