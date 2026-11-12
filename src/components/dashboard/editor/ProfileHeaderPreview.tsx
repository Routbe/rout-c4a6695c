import { useEffect, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProfileView } from "@/components/profile/ProfileView";
import type { ProfileRecord } from "@/lib/profile";

/** Virtueel telefoonviewport (iPhone-breedte) en de schaal naar het frame. */
const PHONE_VIEWPORT = 390;
const PHONE_SCALE = 278 / PHONE_VIEWPORT;

interface ProfileHeaderPreviewProps {
  previewDraft: ProfileRecord;
  /**
   * Exact dezelfde `free`-vlag als de publieke route van dit profiel gebruikt,
   * zodat de preview 1:1 matcht met wat bezoekers zien (badge, URL, namespace).
   */
  free: boolean;
  /** Workspace canvases pass "/w/<slug>" (or the verified domain) here. */
  publicPath?: string;
}

/**
 * Live preview van het profiel: telefoonmockup of desktopvenster, blijft
 * stationair naast de editor terwijl de formulieren links scrollen.
 */
export function ProfileHeaderPreview({ previewDraft, free, publicPath }: ProfileHeaderPreviewProps) {
  /** Live view: realistisch telefoonframe of breed desktopvenster. */
  const [previewDevice, setPreviewDevice] = useState<"mobile" | "desktop">("mobile");
  /** Desktopscherm: werkelijke containerbreedte → schaalfactor voor het 1280px-virtuele viewport. */
  const laptopScreenRef = useRef<HTMLDivElement>(null);
  const [laptopScale, setLaptopScale] = useState(0.3);
  useEffect(() => {
    if (previewDevice !== "desktop") return;
    const el = laptopScreenRef.current;
    if (!el) return;
    const update = () => setLaptopScale(el.clientWidth / 1280);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewDevice]);

  return (
    <aside className="z-10 hidden self-start lg:sticky lg:top-4 lg:col-span-5 lg:flex lg:h-[calc(100vh-2rem)] lg:flex-col lg:justify-between lg:py-2">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-start rounded-3xl border border-border/80 bg-card/40 p-6 shadow-2xl">
        <div className="mb-4 flex w-full items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Live preview
          </p>
          {/* Viewport-switcher: telefoonmockup ↔ desktopvenster */}
          <div
            role="group"
            aria-label="Preview-formaat"
            className="inline-flex items-center rounded-full border border-border bg-muted/40 p-0.5"
          >
            {(
              [
                { id: "mobile", label: "Mobiel", Icon: Smartphone },
                { id: "desktop", label: "Desktop", Icon: Monitor },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPreviewDevice(id)}
                aria-pressed={previewDevice === id}
                title={label}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium transition-all",
                  previewDevice === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="transition-all duration-300 ease-out">
          {previewDevice === "mobile" ? (
            /* Smartphone: vaste 278×588 behuizing (nooit meekrimpen met de
               hoeveelheid inhoud). Binnenin een echt 390×844 telefoonviewport
               dat met CSS-transform wordt geschaald, zodat de preview 1:1
               overeenkomt met de publieke pagina op een telefoon. */
            <div className="mx-auto flex h-[600px] w-[290px] shrink-0 items-stretch overflow-hidden rounded-[36px] border-[6px] border-zinc-800 bg-black shadow-2xl">
              <div className="relative h-full w-full overflow-hidden rounded-[28px] bg-background">
                <span className="absolute left-1/2 top-2 z-10 flex h-3 w-20 -translate-x-1/2 items-center justify-center gap-1 rounded-full bg-zinc-800">
                  <span className="h-1 w-8 rounded-full bg-background/25" />
                  <span className="h-1.5 w-1.5 rounded-full bg-background/35" />
                </span>
                <div className="preview-noscroll h-full w-full overflow-y-auto overflow-x-hidden text-foreground">
                  {/* `zoom` (i.p.v. transform) schaalt óók de layouthoogte, zodat
                      het scrollen in het frame precies klopt. */}
                  <div style={{ width: PHONE_VIEWPORT, zoom: PHONE_SCALE }}>
                    <ProfileView profile={previewDraft} free={free} publicPath={publicPath} preview />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Laptop: ultradunne metalen bezel met webcamstip, glasglans, hinge en 3D-toetsenborddek */
            <div className="mx-auto w-full max-w-[520px] px-8 transition-all duration-300">
              {/* Scherm: 16:10 retina-paneel, dunne bezel, ambient glow */}
              <div className="relative rounded-t-xl border-[2px] border-zinc-700/60 bg-zinc-950 p-1.5 shadow-2xl shadow-black/60 shadow-[0_0_30px_rgba(255,255,255,0.04)]">
                {/* Webcamstip gecentreerd in de bovenbezel */}
                <span
                  className="mx-auto my-0.5 block h-1.5 w-1.5 rounded-full bg-zinc-800"
                  aria-hidden
                />
                <div
                  ref={laptopScreenRef}
                  className="preview-noscroll relative aspect-[16/10] w-full overflow-hidden rounded-[4px] bg-background text-foreground"
                >
                  {/* 1:1 desktopproporties: render in virtueel 1280×800-viewport en schaal
                  mee met de werkelijke containerbreedte via CSS-transform */}
                  <div
                    className="h-[800px] w-[1280px] origin-top-left"
                    style={{ transform: `scale(${laptopScale})` }}
                  >
                    <ProfileView profile={previewDraft} free={free} publicPath={publicPath} layout="wide" preview />
                  </div>
                  {/* Diagonale glasglans over het scherm */}
                  <div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent"
                    aria-hidden
                  />
                </div>
              </div>
              {/* Hinge: donkere metalen balk tussen scherm en dek */}
              <div
                className="mx-auto h-2 w-[98%] rounded-b-sm border-t border-zinc-800 bg-zinc-950"
                aria-hidden
              />
              {/* Onderdek: echt 3D-perspectief — bovenste rij wijkt naar achteren,
              spacebar en trackpad komen naar voren */}
              <div className="[perspective:1000px]">
                <div className="relative mx-auto w-[104%] -translate-x-[2%] origin-top rounded-b-2xl border border-t-0 border-zinc-700/80 bg-gradient-to-b from-zinc-800 to-zinc-900 px-4 pb-3 pt-2 shadow-2xl shadow-black/60 [transform:rotateX(32deg)] [transform-style:preserve-3d]">
                  <div className="space-y-1 rounded-md bg-zinc-950/50 p-1.5">
                    {Array.from({ length: 4 }).map((_, row) => (
                      <div key={row} className="grid grid-cols-12 gap-1">
                        {Array.from({ length: 12 }).map((_, col) => (
                          <span
                            key={col}
                            className="h-2.5 rounded-[2px] border border-zinc-700/50 bg-zinc-800/80"
                          />
                        ))}
                      </div>
                    ))}
                    {/* Spacebar */}
                    <div className="mx-auto h-2.5 w-1/2 rounded-[2px] border border-zinc-700/50 bg-zinc-800/80" />
                  </div>
                  {/* Trackpad */}
                  <div className="mx-auto mt-2 h-3.5 w-1/3 rounded-sm border border-zinc-700/50 bg-zinc-800/40" />
                </div>
              </div>
              <div
                className="mx-auto h-1 w-[70%] rounded-b-full bg-black/40 blur-[2px]"
                aria-hidden
              />
            </div>
          )}
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Conceptvoorbeeld — alleen Publiceren maakt wijzigingen zichtbaar op je profiel.
        </p>
      </div>
    </aside>
  );
}
