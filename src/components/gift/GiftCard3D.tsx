import { useState } from "react";
import { euro, giftDesign } from "@/lib/gift-cards";

/**
 * 3D-weergave van een cadeaubon: pure CSS-perspectief, geen WebGL, dus ook
 * bruikbaar in de mail-preview en op trage toestellen. Klik of toets draait de
 * kaart om (de achterkant toont de code).
 */
export function GiftCard3D({
  code,
  amountCents,
  design,
  recipientName,
  purchaserName,
  message,
  revealCode = true,
}: {
  code: string;
  amountCents: number;
  design: string;
  recipientName?: string | null;
  purchaserName?: string | null;
  message?: string | null;
  revealCode?: boolean;
}) {
  const [flipped, setFlipped] = useState(false);
  const d = giftDesign(design);

  const face: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    backfaceVisibility: "hidden",
    borderRadius: 18,
    padding: 24,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    boxShadow: "0 24px 60px -24px rgba(0,0,0,0.45)",
    border: `1px solid ${d.accent}55`,
  };

  return (
    <div className="[perspective:1400px] w-full max-w-[420px]">
      <button
        type="button"
        aria-label={flipped ? "Toon voorzijde van de cadeaubon" : "Toon achterzijde met de code"}
        onClick={() => setFlipped((v) => !v)}
        className="relative block w-full rounded-[18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ aspectRatio: "1.6 / 1" }}
      >
        <div
          className="relative h-full w-full transition-transform duration-700 motion-reduce:transition-none"
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* Voorzijde */}
          <div style={{ ...face, background: d.front, color: d.ink }}>
            <div className="text-left">
              <p className="text-[11px] tracking-[0.28em]" style={{ color: d.accent }}>
                ROUT CADEAUBON
              </p>
              <p className="mt-2 text-4xl font-semibold">{euro(amountCents)}</p>
            </div>
            <div className="text-left text-sm opacity-80">
              {recipientName ? <p>Voor {recipientName}</p> : null}
              {purchaserName ? <p>Van {purchaserName}</p> : null}
              {message ? <p className="mt-2 line-clamp-2 italic">{message}</p> : null}
            </div>
          </div>

          {/* Achterzijde */}
          <div
            style={{
              ...face,
              background: d.ink,
              color: d.front,
              transform: "rotateY(180deg)",
            }}
          >
            <p className="text-[11px] tracking-[0.28em] text-left" style={{ color: d.accent }}>
              CODE
            </p>
            <p className="text-left font-mono text-2xl">{revealCode ? code : "GIFT-••••-••••"}</p>
            <p className="text-left text-xs opacity-70">
              Vul deze code in bij het afrekenen op rout.be. Eenmalig inwisselbaar.
            </p>
          </div>
        </div>
      </button>
      <p className="mt-3 text-center text-xs text-muted-foreground">Klik op de bon om te draaien</p>
    </div>
  );
}
