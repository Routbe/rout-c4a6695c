import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Download, Loader2, QrCode, Share2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { profileImageSrc } from "@/lib/image-proxy-rules";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { qaPaths, type QaSpace } from "./useQaPublic";
import { shareStoryFile, storyFile, supportsStoryShare } from "@/lib/qa/native-share";

export type QaShareTarget =
  | { kind: "prompt"; prompt: string }
  | { kind: "answer"; question: string; answer: string };

/**
 * Story generator: renders a 1080×1920 card in the browser and hands it to the
 * phone's share sheet (Instagram, Snapchat, WhatsApp…) or downloads it.
 */
export function QaShareDialog({ open, onOpenChange, target, handle, space, displayName, avatarUrl }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: QaShareTarget | null;
  handle: string;
  space: QaSpace;
  displayName: string | null;
  avatarUrl: string | null;
}) {
  const { t } = useI18n();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [video,setVideo]=useState<File|null>(null);
  useEffect(()=>{setVideo(null);if(!open||target?.kind!=="answer")return;
    const controller=new AbortController();let alive=true;
    void import("@/lib/qa/story-video").then(m=>m.renderPresenceVideo(`${target.question}\n\n${target.answer}`,controller.signal)).then(file=>{if(alive)setVideo(file);}).catch(()=>undefined);
    return()=>{alive=false;controller.abort();};
  },[open,target]);
  const qrRef = useRef<HTMLCanvasElement | null>(null);
  const link = typeof window === "undefined" ? qaPaths(handle, space).ask : `${window.location.origin}${qaPaths(handle, space).ask}`;
  const fileName = `rout-${handle}-${target?.kind ?? "story"}.png`;

  useEffect(() => {
    if (!open || !target) return;
    let alive = true;
    let objectUrl: string | null = null;
    setBlob(null); setUrl(null); setFailed(false);
    void import("@/lib/qa/story-card").then(async ({ renderStoryCard }) => {
      const common = { handle, displayName, avatarSrc: profileImageSrc(avatarUrl), hint: t("pages.qa.share.hint"), link };
      const b = await renderStoryCard(
        target.kind === "prompt"
          ? { kind: "prompt", prompt: target.prompt, sendMe: t("pages.qa.card.sendMe"), ...common }
          : { kind: "answer", question: target.question, answer: target.answer, label: t("pages.qa.card.anonymous"), ...common },
      );
      if (!alive) return;
      objectUrl = URL.createObjectURL(b);
      setBlob(b); setUrl(objectUrl);
    }).catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, target, handle, displayName, avatarUrl, link, t]);

  const file = blob ? storyFile(blob, fileName) : null;
  const canShareFile = Boolean(file && supportsStoryShare(file));

  const share = async () => {
    if (!file) return;
    try {
      await shareStoryFile(file);
    } catch {
      toast.error(t("pages.qa.share.failed"));
    }
  };
  /** Instagram has no web API for link stickers: copy the link first, then open the share sheet (as NGL does). */
  const shareInstagram = () => {
    void navigator.clipboard?.writeText(link).then(() => toast.success(t("pages.qa.share.igCopied"))).catch(() => undefined);
    if (file && supportsStoryShare(file)) void shareStoryFile(file).catch(() => toast.error(t("pages.qa.share.failed")));
    else download();
  };
  /** Snapchat Creative Kit: opens the camera with the ask link attached, so the snap is tappable. */
  const shareSnapchat = () => {
    window.open(`https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(link)}`, "_blank", "noopener");
  };
  const save = (href: string, name: string) => {
    const a = document.createElement("a");
    a.href = href; a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  };
  const download = () => { if (url) save(url, fileName); };
  /** The saved PNG gets a white quiet zone so every camera reads it. */
  const downloadQr = () => {
    const src = qrRef.current;
    if (!src) return;
    const pad = 48;
    const out = document.createElement("canvas");
    out.width = src.width + pad * 2; out.height = src.height + pad * 2;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, pad, pad);
    save(out.toDataURL("image/png"), `rout-${handle}-ask-qr.png`);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t("pages.qa.share.copied"));
    } catch {
      toast.error(t("pages.qa.inbox.failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("pages.qa.share.title")}</DialogTitle>
          <DialogDescription>{target?.kind === "answer" ? t("pages.qa.share.answerCard") : t("pages.qa.share.promptCard")}</DialogDescription>
        </DialogHeader>
        <div className="mx-auto aspect-[9/16] w-full max-w-[min(18rem,calc((100dvh-22rem)*9/16))] min-w-[10rem] overflow-hidden rounded-2xl border border-border bg-muted">
          {url ? (
            <img src={url} alt={t("pages.qa.share.title")} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
              {failed ? t("pages.qa.share.failed") : <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t("pages.qa.share.rendering")}</>}
            </div>
          )}
        </div>
        <div className="grid gap-2">
          {video&&<Button variant="outline" onClick={()=>{if(supportsStoryShare(video))void shareStoryFile(video).catch(()=>toast.error(t("pages.qa.share.failed")));else {const href=URL.createObjectURL(video);save(href,video.name);setTimeout(()=>URL.revokeObjectURL(href),1000);}}}><Share2 className="h-4 w-4"/>{t(supportsStoryShare(video)?"presence.share":"presence.download")}</Button>}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={shareInstagram} disabled={!url} className="gap-2"><Share2 className="h-4 w-4" aria-hidden />{t("pages.qa.share.instagram")}</Button>
            <Button variant="outline" onClick={shareSnapchat} className="gap-2"><Share2 className="h-4 w-4" aria-hidden />{t("pages.qa.share.snapchat")}</Button>
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>{t("pages.qa.share.igSteps")}</li>
            <li>{t("pages.qa.share.snapSteps")}</li>
          </ul>
          {canShareFile && (
            <Button variant="outline" onClick={() => void share()} className="gap-2"><Share2 className="h-4 w-4" aria-hidden />{t("pages.qa.share.share")}</Button>
          )}
          <Button variant="outline" onClick={download} disabled={!url} className="gap-2">
            <Download className="h-4 w-4" aria-hidden />{t("pages.qa.share.download")}
          </Button>
          <div className="grid gap-2">
            <Button variant="outline" size="sm" onClick={() => void copy()} className="gap-1"><Copy className="h-3.5 w-3.5" aria-hidden />{t("pages.qa.share.copy")}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("pages.qa.share.howto")} <span className="break-all font-mono text-foreground">{link.replace(/^https?:\/\//, "")}</span></p>
          <div className="mt-1 flex items-center gap-3 rounded-2xl border border-border p-3">
            <div className="qr-surface shrink-0 select-none rounded-xl p-2">
              <QRCodeCanvas ref={qrRef} value={link} size={512} level="M" marginSize={0} bgColor="#ffffff" fgColor="#1c1917" style={{ width: 96, height: 96 }} aria-label={t("pages.qa.share.qrLabel")} />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs text-muted-foreground">{t("pages.qa.share.qrHint")}</p>
              <Button variant="outline" size="sm" onClick={downloadQr} className="gap-1"><QrCode className="h-3.5 w-3.5" aria-hidden />{t("pages.qa.share.qrDownload")}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
