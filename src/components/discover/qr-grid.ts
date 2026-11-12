/** Deterministic decorative QR-like module grid (not a scannable code). */
export function qrModules(size: number, seed: number): boolean[] {
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 1000) / 1000;
  };
  const cells: boolean[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const finder = (fx: number, fy: number) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7;
      const inFinder = finder(0, 0) || finder(size - 7, 0) || finder(0, size - 7);
      const quiet = (x === 7 || y === 7) && (x < 8 && y < 8) || (x === size - 8 && y < 8) || (y === 7 && x >= size - 8) || (x === 7 && y >= size - 8) || (y === size - 8 && x < 8);
      cells.push(inFinder || quiet ? false : rnd() > 0.52);
    }
  }
  return cells;
}

/** Finder-pattern squares as SVG-friendly boxes. */
export function finderOrigins(size: number): [number, number][] {
  return [[0, 0], [size - 7, 0], [0, size - 7]];
}
