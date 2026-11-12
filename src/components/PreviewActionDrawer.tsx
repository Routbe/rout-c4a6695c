import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, Download, Share2, Video, ContactRound, Link2 } from "lucide-react";
import { toast } from "sonner";
import { downloadVCard } from "@/lib/rich-qr";
import { cardLandingUrl } from "@/lib/card-link";
import { i18n as trI18n } from "@/lib/i18n";

async function copyText(value: string, message: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(message);
    return true;
  } catch {
    toast.error(trI18n.t("ui.2fe8de63f0"));
    return false;
  }
}

async function nativeShare(payload: ShareData, fallback: string) {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(payload);
      return;
    } catch (err) {
      // AbortError = user dismissed the sheet; stay silent.
      if ((err as DOMException)?.name === "AbortError") return;
    }
  }
  await copyText(fallback, "Sharing is not supported here — link copied instead.");
}

interface MeetingActionDrawerProps {
  /** Fully-built meeting URL (Zoom / Teams / Google Meet). */
  link: string;
  passcode?: string;
}

/** Interactive copy + share drawer shown under the preview for meeting QRs. */
export function MeetingActionDrawer({ link, passcode }: MeetingActionDrawerProps) {
  const [copied, setCopied] = useState(false);
  if (!link) return null;

  let host = "";
  try {
    host = new URL(link).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }

  const platform = /zoom\./i.test(host)
    ? "Zoom"
    : /teams\.(microsoft|live)\./i.test(host)
      ? "Microsoft Teams"
      : /meet\.google\./i.test(host)
        ? "Google Meet"
        : /whereby|jitsi|webex/i.test(host)
          ? host
          : "Meeting";

  return (
    <div className="w-full rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 text-foreground" />
        <span className="text-sm font-medium text-foreground">{platform} link ready</span>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {link}
        </span>
      </div>

      {passcode ? (
        <p className="text-[11px] text-muted-foreground">
          Passcode <span className="font-mono text-foreground">{passcode}</span> is included in the
          link where the platform supports it.
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 flex-1 gap-2"
          onClick={async () => {
            const ok = await copyText(link, "Meeting link copied");
            if (ok) {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button
          type="button"
          className="h-10 flex-1 gap-2"
          onClick={() =>
            nativeShare({ title: `${platform} meeting`, text: "Join my meeting", url: link }, link)
          }
        >
          <Share2 className="h-4 w-4" /> Share
        </Button>
      </div>
    </div>
  );
}

interface ContactActionDrawerProps {
  values: Record<string, string>;
}

/** Contact-card drawer: one-tap .vcf download, landing link and native share. */
export function ContactActionDrawer({ values }: ContactActionDrawerProps) {
  const hasName = Boolean((values.firstName || "").trim() || (values.lastName || "").trim());
  if (!hasName) return null;

  const landing = cardLandingUrl(values);
  const fullName = [values.firstName, values.lastName].filter(Boolean).join(" ").trim();

  return (
    <div className="w-full rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ContactRound className="h-4 w-4 text-foreground" />
        <span className="text-sm font-medium text-foreground">Contact card for {fullName}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Scanning the QR imports the contact directly. You can also hand out the file or a shareable
        card page.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="h-10 flex-1 gap-2"
          onClick={() => {
            if (downloadVCard(values)) toast.success(trI18n.t("ui.5586350a8d"));
            else toast.error(trI18n.t("ui.b8198341fb"));
          }}
        >
          <Download className="h-4 w-4" /> Download .vcf
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 flex-1 gap-2"
          onClick={() => copyText(landing, "Card link copied")}
        >
          <Copy className="h-4 w-4" /> Copy card link
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 gap-2"
          onClick={() =>
            nativeShare(
              { title: fullName, text: `Contact card for ${fullName}`, url: landing },
              landing,
            )
          }
          aria-label="Share contact card"
        >
          <Share2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
