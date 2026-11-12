import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

/** Trust modal: bottom sheet on phones, centered dialog on larger screens. */
export function TrustBadgeModal({
  open,
  onClose,
  icon,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  icon?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  const mobile = useIsMobile();
  const onOpenChange = (next: boolean) => !next && onClose();
  if (mobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2">{icon}{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          <div className="px-4 pb-8 text-sm">{children}</div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{icon}{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="text-sm">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export function TrustRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`text-right font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
