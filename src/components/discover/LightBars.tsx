/** Neon-style light bars behind a hero; deterministic so SSR and hydration match. */
const BARS = Array.from({ length: 36 }, (_, i) => {
  const h = 30 + ((i * 37) % 60);
  const d = ((i * 53) % 40) / 10;
  const o = 0.25 + ((i * 29) % 50) / 100;
  return { h, d, o };
});

export function LightBars() {
  return (
    <div className="dsc-bars" aria-hidden>
      {BARS.map((b, i) => <span key={i} style={{ height: `${b.h}%`, animationDelay: `-${b.d}s`, opacity: b.o }} />)}
    </div>
  );
}
