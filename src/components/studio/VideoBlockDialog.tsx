import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { Lock, UploadCloud } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { videoEmbedUrl } from "@/lib/video-embed";
import { ProPill } from "./ProPill";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Adds a video block with the pasted URL. */
  onAdd: (url: string) => void;
  onPro: () => void;
}

/** Video block: free embed by link, or (Pro) native upload. */
export function VideoBlockDialog({ open, onClose, onAdd, onPro }: Props) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const embed = useMemo(() => videoEmbedUrl(url), [url]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("studio.video.add")}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="link">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="link">{t("studio.video.linkTab")}</TabsTrigger>
            <TabsTrigger value="upload" className="gap-1.5"> {t("studio.video.uploadTab")} <ProPill />
            </TabsTrigger>
          </TabsList>
          <TabsContent value="link" className="space-y-3 pt-3">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=… · vimeo.com/… · tiktok.com/…"
              aria-label={t("studio.video.link")}
              spellCheck={false}
            />
            {embed ? (
              <div className="aspect-video overflow-hidden rounded-xl border border-border bg-muted">
                <iframe
                  src={embed}
                  title={t("studio.video.preview")}
                  className="h-full w-full"
                  allow="encrypted-media; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
            ) : url.trim() ? (
              <p className="text-xs text-muted-foreground">{t("studio.video.help")}</p>
            ) : null}
            <Button
              className="w-full"
              disabled={!embed}
              onClick={() => {
                onAdd(url.trim());
                setUrl("");
                onClose();
              }}
            > {t("studio.video.add")} </Button>
          </TabsContent>
          <TabsContent value="upload" className="pt-3">
            <button
              type="button"
              onClick={onPro}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-muted-foreground transition-colors hover:bg-muted/50"
            >
              <span className="relative">
                <UploadCloud className="h-8 w-8" aria-hidden />
                <Lock className="absolute -bottom-1 -right-1 h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="text-sm font-medium text-foreground">{t("studio.video.drop")}</span>
              <span className="text-xs">{t("studio.video.pro")}</span>
            </button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
