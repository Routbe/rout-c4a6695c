import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, BadgeCheck, Loader2, Pencil, ShieldCheck, UserX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { assignAliasHandle, assignHandle } from "@/lib/admin.functions";
import { strictHandleIssue } from "@/lib/handle-validation";
import { sanitizeHandleInput } from "@/lib/validations/sanitizeHandle";
import { i18n as trI18n } from "@/lib/i18n";

/**
 * Elke gebruiker draagt twee identiteiten:
 *   • het geverifieerde rootprofiel  → rout.be/<handle>
 *   • het gratis aliasprofiel        → rout.be/u/<alias>
 *
 * Beide zijn hier los bewerkbaar via een potloodje naast de naam. Een
 * ongeldige (historische) handle krijgt een rood uitroepteken in een cirkel
 * met de exacte reden ernaast.
 */

type Kind = "verified" | "alias";

function InvalidMark({ issue }: { issue: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive"
      title={issue}
      data-testid="invalid-handle"
    >
      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="sr-only">Ongeldige gebruikersnaam:</span>
      {issue}
    </span>
  );
}

export function UserHandleEditor({
  userId,
  username,
  aliasHandle,
  verified,
  vipGrant,
  onSaved,
}: {
  userId: string;
  username: string | null;
  aliasHandle: string | null;
  verified: boolean;
  vipGrant: boolean;
  onSaved: () => void;
}) {
  const saveVerified = useServerFn(assignHandle);
  const saveAlias = useServerFn(assignAliasHandle);

  const [open, setOpen] = useState<Kind | null>(null);
  const [value, setValue] = useState("");
  const [vip, setVip] = useState(vipGrant);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValue(open === "alias" ? (aliasHandle ?? "") : (username ?? ""));
    setVip(vipGrant);
  }, [open, aliasHandle, username, vipGrant]);

  const rootIssue = username ? strictHandleIssue(username) : null;
  const aliasIssue = aliasHandle ? strictHandleIssue(aliasHandle, { alias: true }) : null;

  const clean = sanitizeHandleInput(value);
  const draftIssue = clean ? strictHandleIssue(clean, { alias: open === "alias" }) : null;

  const submit = async () => {
    if (!clean) return toast.error(trI18n.t("ui.da2709d61e"));
    if (draftIssue && !(open === "verified" && vip)) return toast.error(draftIssue);
    setBusy(true);
    try {
      const res =
        open === "alias"
          ? await saveAlias({ data: { userId, handle: clean } })
          : await saveVerified({ data: { userId, handle: clean, vipGrant: vip } });
      if (!res.ok) {
        toast.error(res.reason);
        return;
      }
      toast.success(
        open === "alias" ? `Alias gewijzigd naar u/${clean}.` : `Handle gewijzigd naar @${clean}.`,
      );
      setOpen(null);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Wijzigen mislukt.");
    } finally {
      setBusy(false);
    }
  };

  const Row = ({
    kind,
    icon,
    label,
    url,
    issue,
  }: {
    kind: Kind;
    icon: React.ReactNode;
    label: string;
    url: string;
    issue: string | null;
  }) => (
    <div className="space-y-0.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        {icon}
        <span className="truncate">{label}</span>
        <button
          type="button"
          aria-label={`${kind === "alias" ? "Alias" : "Handle"} wijzigen`}
          data-testid={`edit-${kind}-handle`}
          onClick={() => setOpen(kind)}
          className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
      </p>
      <p className="font-mono text-[11px] text-muted-foreground">{url}</p>
      {issue ? <InvalidMark issue={issue} /> : null}
    </div>
  );

  return (
    <div className="space-y-1.5">
      <Row
        kind="verified"
        icon={
          verified ? (
            <BadgeCheck className="h-3.5 w-3.5 text-primary" aria-label="Geverifieerd" />
          ) : (
            <UserX className="h-3.5 w-3.5 text-muted-foreground" aria-label="Niet geverifieerd" />
          )
        }
        label={
          username
            ? `@${username}${verified ? "" : " · niet geverifieerd"}`
            : "— geen handle"
        }
        url={`rout.be/${username ?? "…"}`}
        issue={rootIssue}
      />
      <Row
        kind="alias"
        icon={<ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
        label={aliasHandle ? `u/${aliasHandle}` : "— geen aliasprofiel"}
        url={`rout.be/u/${aliasHandle ?? "…"}`}
        issue={aliasIssue}
      />

      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {open === "alias" ? "Gratis alias wijzigen" : "Geverifieerde handle wijzigen"}
            </DialogTitle>
            <DialogDescription>
              {open === "alias"
                ? "Het gratis profiel op rout.be/u/<alias>. Minstens 5 tekens en 2 cijfers."
                : "Het geverifieerde rootprofiel op rout.be/<handle>. De oude @rout.be-alias wordt vrijgegeven."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="admin-handle-input" className="text-xs">
                Gebruikersnaam
              </Label>
              <Input
                id="admin-handle-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={open === "alias" ? "jona50" : "jan.jansen"}
              />
              <p className="font-mono text-[11px] text-muted-foreground">
                rout.be/{open === "alias" ? "u/" : ""}
                {clean || "…"}
              </p>
              {draftIssue ? <InvalidMark issue={draftIssue} /> : null}
            </div>

            {open === "verified" ? (
              <div className="flex items-center gap-2">
                <Switch id="admin-vip-grant" checked={vip} onCheckedChange={setVip} />
                <Label htmlFor="admin-vip-grant" className="text-xs">
                  VIP-toekenning — laat een korte handle (3–4 tekens) toe
                </Label>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)} disabled={busy}>
              Annuleren
            </Button>
            <Button onClick={() => void submit()} disabled={busy || !clean}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
