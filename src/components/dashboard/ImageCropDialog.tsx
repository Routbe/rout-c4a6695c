import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { i18n as trI18n } from "@/lib/i18n";

/** Snijdt bij, draait en comprimeert in de browser naar WebP (max `maxWidth` px breed). */
async function renderCrop(src: string, area: Area, rotation: number, maxWidth: number): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const bw = img.width * cos + img.height * sin;
  const bh = img.width * sin + img.height * cos;
  const rotated = document.createElement("canvas");
  rotated.width = bw;
  rotated.height = bh;
  const rc = rotated.getContext("2d")!;
  rc.translate(bw / 2, bh / 2);
  rc.rotate(rad);
  rc.drawImage(img, -img.width / 2, -img.height / 2);

  const scale = Math.min(1, maxWidth / area.width);
  const out = document.createElement("canvas");
  out.width = Math.round(area.width * scale);
  out.height = Math.round(area.height * scale);
  out.getContext("2d")!.drawImage(rotated, area.x, area.y, area.width, area.height, 0, 0, out.width, out.height);
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error("crop"))), "image/webp", 0.82));
}

export function ImageCropDialog({
  src,
  aspect = 4 / 3,
  maxWidth = 1600,
  onCancel,
  onDone,
}: {
  src: string | null;
  aspect?: number;
  maxWidth?: number;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const onComplete = useCallback((_: Area, px: Area) => setArea(px), []);

  return (
    <Dialog open={!!src} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{trI18n.t("ui.dbf99d1535")}</DialogTitle>
        </DialogHeader>
        <div className="relative h-72 overflow-hidden rounded-xl bg-muted">
          {src && (
            <Cropper image={src} crop={crop} zoom={zoom} rotation={rotation} aspect={aspect} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onComplete} />
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <Slider value={[zoom]} min={1} max={3} step={0.05} onValueChange={(v) => setZoom(v[0] ?? 1)} aria-label="Zoom" />
          <Button type="button" variant="outline" size="sm" onClick={() => setRotation((r) => (r + 90) % 360)} aria-label="Draai 90 graden">
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>{trI18n.t("ui.c2fbda4ee9")}</Button>
          <Button
            disabled={!area || busy}
            onClick={async () => {
              if (!src || !area) return;
              setBusy(true);
              try {
                onDone(await renderCrop(src, area, rotation, maxWidth));
              } finally {
                setBusy(false);
              }
            }}
          >
            Gebruiken
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
