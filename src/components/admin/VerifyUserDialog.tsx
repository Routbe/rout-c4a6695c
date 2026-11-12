import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { setUserVerifiedStatus } from "@/lib/admin-access.functions";
import { verifiedHandleSuggestionList } from "@/lib/verified-handle";
import { i18n as trI18n } from "@/lib/i18n";

/**
 * Handmatige verificatie door een admin: wettelijke voor- en achternaam zijn
 * verplicht. Bij bevestiging wordt het account geverifieerd, naar de pro-tier
 * getild en krijgt het een root-handle op basis van de naam.
 */
export function VerifyUserDialog({
  userId,
  displayName,
  firstName,
  lastName,
  /** Al geverifieerd? Dan wijzigt deze dialoog de geverifieerde naam. */
  alreadyVerified = false,
  onDone,
}: {
  userId: string;
  displayName: string | null;
  firstName?: string | null;
  lastName?: string | null;
  alreadyVerified?: boolean;
  onDone?: () => void | Promise<void>;
}) {
  const verify = useServerFn(setUserVerifiedStatus);
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState(firstName ?? "");
  const [last, setLast] = useState(lastName ?? "");
  const [busy, setBusy] = useState(false);
  // Bij een naamswijziging mag de handle mee veranderen naar voornaam.achternaam.
  const [renameHandle, setRenameHandle] = useState(!alreadyVerified);

  const preview = verifiedHandleSuggestionList(`${first} ${last}`.trim())[0] ?? null;

  const submit = async () => {
    if (!first.trim() || !last.trim()) {
      toast.error(trI18n.t("ui.d8122b5991"));
      return;
    }
    setBusy(true);
    try {
      const res = await verify({
        data: {
          userId,
          verified: true,
          firstName: first.trim(),
          lastName: last.trim(),
          renameHandle,
        },
      });
      if (res.ok) {
        toast.success(
          res.promotedHandle
            ? `Naam bewaard — nu rout.be/${res.promotedHandle}`
            : alreadyVerified
              ? "Geverifieerde naam bijgewerkt."
              : "Account geverifieerd en gepromoveerd naar pro.",
        );
        setOpen(false);
        await onDone?.();
      } else {
        toast.error(res.error ?? "Verifiëren is mislukt.");
      }
    } catch {
      toast.error(trI18n.t("ui.0bc633240f"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="secondary" className="h-8" onClick={() => setOpen(true)}>
        <BadgeCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />{" "}
        {alreadyVerified ? "Naam wijzigen" : "Verifieer & activeer"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {alreadyVerified ? "Geverifieerde naam wijzigen" : "Account verifiëren"}
            </DialogTitle>
            <DialogDescription>
              {alreadyVerified
                ? "Pas de wettelijke naam aan zoals op het identiteitsbewijs."
                : "Vul de wettelijke naam in zoals op het identiteitsbewijs. Het account wordt geverifieerd, krijgt de pro-tier en verhuist van /u/alias naar rout.be/handle."}
              {displayName ? ` Account: ${displayName}.` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="legal-first">{trI18n.t("ui.5fecc59844")}</Label>
              <Input
                id="legal-first"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                placeholder="Jona"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="legal-last">{trI18n.t("ui.3451206bbd")}</Label>
              <Input
                id="legal-last"
                value={last}
                onChange={(e) => setLast(e.target.value)}
                placeholder="Delplanche"
              />
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{trI18n.t("ui.2d41ad5763")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Zet de handle automatisch op voornaam.achternaam (volledig uitgeschreven, volgens de
                gewone handleregels). De volgorde kan achteraf nog aangepast worden.
              </p>
            </div>
            <Switch
              aria-label="Gebruikersnaam mee wijzigen"
              checked={renameHandle}
              onCheckedChange={setRenameHandle}
            />
          </div>

          {preview && renameHandle ? (
            <p className="font-mono text-xs text-muted-foreground">Voorstel: rout.be/{preview}</p>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {trI18n.t("ui.c2fbda4ee9")}
            </Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {alreadyVerified ? "Opslaan" : "Verifiëren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
