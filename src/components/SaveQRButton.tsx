import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/db/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Bookmark, Loader2 } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import { extractDomain } from "@/lib/brand";
import { useI18n } from "@/lib/i18n";

interface Props {
  qrType: string;
  qrValue: string;
  config: Record<string, unknown>;
  disabled?: boolean;
  /** Extra context used to build a nicer default name (Wi-Fi SSID, contact name…). */
  nameHint?: string;
}

const TYPE_LABELS: Record<string, string> = {
  url: "Link",
  text: "Text",
  wifi: "Wi-Fi access",
  email: "E-mail",
  sms: "SMS",
  whatsapp: "WhatsApp",
  image: "Image",
  pdf: "PDF",
  mp3: "Audio",
  app: "App link",
  vcard: "Contact card",
  event: "Event",
  social: "Social hub",
  maps: "Location",
  meeting: "Meeting link",
  steam: "Steam profile",
};

/**
 * Build a ready-to-accept name so saving is a single click:
 * "delplanche.com QR — Aug 2026", "Wi-Fi access — Aug 2026", …
 */
export function suggestQRName(
  qrType: string,
  qrValue: string,
  hint?: string,
  /** Locale + fallback label so the generated name follows the UI language. */
  opts?: { locale?: string; fallbackLabel?: string },
): string {
  const stamp = new Date().toLocaleDateString(opts?.locale ?? "en-GB", {
    month: "short",
    year: "numeric",
  });
  const domain = ["url", "app", "image", "pdf", "mp3"].includes(qrType)
    ? extractDomain(qrValue)
    : null;
  const subject =
    (hint || "").trim() || domain || TYPE_LABELS[qrType] || opts?.fallbackLabel || "QR code";
  const suffix = domain && !hint ? " QR" : "";
  return `${subject}${suffix} — ${stamp}`;
}

export function SaveQRButton({ qrType, qrValue, config, disabled, nameHint }: Props) {
  const { user } = useAuth();
  const nav = useNavigate();
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestion = useMemo(
    () =>
      suggestQRName(qrType, qrValue, nameHint, {
        locale,
        fallbackLabel: t("save.qrCode"),
      }),
    [qrType, qrValue, nameHint, locale, t],
  );

  // Pre-fill on every open so the field is never empty and Enter just works.
  useEffect(() => {
    if (open) setName(suggestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClick = () => {
    if (!user) {
      toast(t("save.signIn"), {
        action: { label: t("save.signInAction"), onClick: () => nav("/auth/sign-in") },
      });
      return;
    }
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    // Blank input simply falls back to the suggestion — no forced typing.
    const finalName = (name.trim() || suggestion).slice(0, 120);
    setBusy(true);
    const { error } = await db.from("saved_qrs").insert({
      user_id: user.id,
      name: finalName,
      qr_type: qrType,
      qr_value: qrValue,
      config: config as never,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("save.saved", { name: finalName }));
    setOpen(false);
    setName("");
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={disabled}
        className="gap-1.5"
      >
        <Bookmark className="w-4 h-4" /> {t("save.cta")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onOpenAutoFocus={(e) => {
            // Focus and select the suggestion so one keystroke replaces it,
            // and Enter alone accepts it.
            e.preventDefault();
            inputRef.current?.focus();
            inputRef.current?.select();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("save.title")}</DialogTitle>
            <DialogDescription>{t("save.desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("save.name")}</Label>
              <Input
                ref={inputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy) {
                    e.preventDefault();
                    void save();
                  }
                }}
                placeholder={suggestion}
              />
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {t("save.value")}: {qrValue}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("save.cancel")}
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("save.cta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
