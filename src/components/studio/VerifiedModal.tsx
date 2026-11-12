import { BadgeCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IdentityVerification } from "@/components/settings/IdentityVerification";

/**
 * "ROUT Verified" popup. Verification is identity-only (Didit / W Identity);
 * payments never grant the badge.
 */
export function VerifiedModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 font-display text-2xl tracking-tight">
            <BadgeCheck className="h-6 w-6 text-primary" aria-hidden /> ROUT Verified
          </DialogTitle>
          <DialogDescription>
            Verifieer je identiteit met een officieel document voor maximale betrouwbaarheid.
          </DialogDescription>
        </DialogHeader>
        <IdentityVerification />
      </DialogContent>
    </Dialog>
  );
}
