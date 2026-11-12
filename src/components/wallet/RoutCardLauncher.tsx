import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoutCardDialog } from "./RoutCardDialog";

/** Studio entry for the ROUT Card (3D preview + Google/Apple Wallet + vCard). */
export function RoutCardLauncher({ handle, space }: { handle: string; space?: "root" | "alias" }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!handle) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{t("card.title")}</p>
        <p className="text-xs text-muted-foreground">{t("card.studioHelp")}</p>
      </div>
      <Button type="button" variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <Wallet className="h-4 w-4" aria-hidden /> {t("card.open")}
      </Button>
      <RoutCardDialog open={open} onOpenChange={setOpen} handle={handle} space={space} />
    </div>
  );
}
