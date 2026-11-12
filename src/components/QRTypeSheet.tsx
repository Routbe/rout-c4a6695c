import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useI18n } from "@/lib/i18n";
import { QRTypeRow, QRType, qrTypeCategories, categoryOf } from "./QRTypeSelector";

interface Props {
  selectedType: QRType;
  onTypeChange: (type: QRType) => void;
}

/** Horizontal category pills + a sheet listing only the tapped category. */
export function QRTypeSheet({ selectedType, onTypeChange }: Props) {
  const { t } = useI18n();
  const [openCat, setOpenCat] = useState<string | null>(null);
  const activeCat = qrTypeCategories.find((c) => c.id === openCat) ?? null;
  const selectedCatId = categoryOf(selectedType).id;

  const pick = (id: QRType) => {
    onTypeChange(id);
    setOpenCat(null);
  };

  return (
    <>
      <div className="-mx-4 w-[calc(100%+2rem)] max-w-[calc(100%+2rem)] min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max min-w-full items-center gap-2 px-4 pb-1">
          {qrTypeCategories.map(({ id, labelKey, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setOpenCat(id)}
              className={cn(
                "flex items-center gap-1.5 px-3 h-9 rounded-full border text-xs font-medium whitespace-nowrap transition-colors",
                id === selectedCatId
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.7} />
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      <Drawer open={!!activeCat} onOpenChange={(o) => !o && setOpenCat(null)}>
        <DrawerContent className="max-h-[85vh]">
          <div className="flex items-center justify-between px-4 pb-2">
            <DrawerTitle className="font-display text-lg text-foreground">
              {activeCat ? t(activeCat.labelKey) : t("type.heading")}
            </DrawerTitle>
            <DrawerClose
              aria-label="Close"
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted"
            >
              <X className="w-4 h-4" />
            </DrawerClose>
          </div>

          <div className="overflow-y-auto px-4 pb-8 flex flex-col gap-1.5">
            {activeCat?.types.map((type) => (
              <QRTypeRow
                key={type.id}
                type={type}
                selected={type.id === selectedType}
                onSelect={pick}
                fallbackIcon={activeCat.Icon}
              />
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
