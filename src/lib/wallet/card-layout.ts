/**
 * Shared positions on the card face, as fractions of width/height (0..1 from
 * the top-left) plus physical text size. The canvas faces, the WebGL SDF text
 * and the CMF production JSON all read these, so screen and print match.
 */
export const FACE_LAYOUT = {
  displayName: { x: 0.5, y: 0.7, sizeMm: 4.2 },
  region: { x: 0.5, y: 0.79, sizeMm: 2.2 },
  publicQr: { x: 0.06, y: 0.86, sizeMm: 9 },
  mrz: { x: 0.05, y: 0.86, sizeMm: 2.5 },
} as const;
