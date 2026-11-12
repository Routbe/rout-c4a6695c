import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getMyBusinessRequest,
  getMyInfluencerRequest,
  requestBusinessVerification,
  requestInfluencerVerification,
  getMyApprovedHandles,
  claimApprovedHandle,
} from "@/lib/verification-requests.functions";
import { i18n as trI18n } from "@/lib/i18n";

/**
 * Twee rustige, kleine knoppen onder de gewone verificatie:
 *
 *  • Verifieer als bedrijf  → manuele controle van bedrijfsnaam, btw-nummer en
 *    domeinnaam; na goedkeuring rout.be/<domein> met de zwarte badge.
 *  • Vraag influencerstatus → vier gewenste namen in volgorde plus sociale
 *    kanalen; € 70, of gratis wanneer je al geverifieerd bent.
 */

type Row = Record<string, unknown> | null;

const statusLabel: Record<string, string> = {
  pending: "In behandeling",
  awaiting_payment: "Wacht op betaling",
  approved: "Goedgekeurd",
  rejected: "Afgewezen",
};

export function BusinessInfluencerRequests() {
  const submitBusiness = useServerFn(requestBusinessVerification);
  const submitInfluencer = useServerFn(requestInfluencerVerification);
  const loadBusiness = useServerFn(getMyBusinessRequest);
  const loadInfluencer = useServerFn(getMyInfluencerRequest);

  const [business, setBusiness] = useState<Row>(null);
  const [influencer, setInfluencer] = useState<Row>(null);
  const [busy, setBusy] = useState(false);
  const [openBusiness, setOpenBusiness] = useState(false);
  const [openInfluencer, setOpenInfluencer] = useState(false);

  useEffect(() => {
    void loadBusiness().then((r) => setBusiness(r as Row));
    void loadInfluencer().then((r) => setInfluencer(r as Row));
  }, [loadBusiness, loadInfluencer]);

  const onBusiness = async (form: FormData) => {
    setBusy(true);
    try {
      const result = await submitBusiness({
        data: {
          companyName: String(form.get("companyName") ?? ""),
          legalForm: String(form.get("legalForm") ?? "") || null,
          vatNumber: String(form.get("vatNumber") ?? ""),
          address: String(form.get("address") ?? "") || null,
          websiteDomain: String(form.get("websiteDomain") ?? ""),
          contactName: String(form.get("contactName") ?? "") || null,
        },
      });
      if (!result.ok) {
        toast.error(result.reason ?? "Aanvraag mislukt.");
        return;
      }
      toast.success(trI18n.t("ui.09724f47fd"));
      setOpenBusiness(false);
      setBusiness(await (loadBusiness() as Promise<Row>));
    } catch {
      toast.error(trI18n.t("ui.0d29b74f42"));
    } finally {
      setBusy(false);
    }
  };

  const onInfluencer = async (form: FormData) => {
    setBusy(true);
    try {
      const choices = [1, 2, 3, 4]
        .map((i) => String(form.get(`handle${i}`) ?? "").trim())
        .filter(Boolean);
      const links = String(form.get("socials") ?? "")
        .split(/[\n,]/)
        .map((l) => l.trim())
        .filter(Boolean);
      const result = await submitInfluencer({
        data: {
          handleChoices: choices,
          socialLinks: links,
          motivation: String(form.get("motivation") ?? "") || null,
        },
      });
      if (!result.ok) {
        toast.error(result.reason ?? "Aanvraag mislukt.");
        return;
      }
      toast.success(
        result.feeCents === 0
          ? "Aanvraag verstuurd — gratis omdat je al geverifieerd bent."
          : "Aanvraag verstuurd. Na betaling van € 70 nemen we ze na.",
      );
      setOpenInfluencer(false);
      setInfluencer(await (loadInfluencer() as Promise<Row>));
    } catch {
      toast.error(trI18n.t("ui.0d29b74f42"));
    } finally {
      setBusy(false);
    }
  };

  const badge = (row: Row) => {
    const status = row?.["status"] as string | undefined;
    if (!status) return null;
    return (
      <span className="text-xs text-muted-foreground">
        · {statusLabel[status] ?? status}
      </span>
    );
  };

  return (
    <>
    <ClaimApprovedHandle />
    <div className="mt-6 flex flex-wrap items-center gap-3 border-t pt-4">
      <Dialog open={openBusiness} onOpenChange={setOpenBusiness}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <Building2 className="mr-2 h-4 w-4" /> Verifieer als bedrijf
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bedrijfsverificatie</DialogTitle>
            <DialogDescription>
              Na een manuele controle krijgt je bedrijf de zwarte badge en een pagina op je
              officiële domeinnaam, bv. rout.be/rout.be.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void onBusiness(new FormData(e.currentTarget));
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="companyName">Officiële bedrijfsnaam</Label>
              <Input id="companyName" name="companyName" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="legalForm">Rechtsvorm</Label>
                <Input id="legalForm" name="legalForm" placeholder="BV, VZW, …" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vatNumber">Btw-nummer</Label>
                <Input id="vatNumber" name="vatNumber" placeholder="BE0123456789" required />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="address">Maatschappelijke zetel</Label>
              <Input id="address" name="address" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="websiteDomain">Domeinnaam</Label>
              <Input id="websiteDomain" name="websiteDomain" placeholder="rout.be" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contactName">Contactpersoon</Label>
              <Input id="contactName" name="contactName" />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              Aanvraag versturen
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {badge(business)}

      <Dialog open={openInfluencer} onOpenChange={setOpenInfluencer}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <Sparkles className="mr-2 h-4 w-4 text-[#ec4899]" /> Vraag influencerstatus
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Influencerverificatie</DialogTitle>
            <DialogDescription>
              Geef vier gewenste namen in volgorde van voorkeur en je sociale kanalen. € 70 —
              gratis wanneer je al geverifieerd bent.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void onInfluencer(new FormData(e.currentTarget));
            }}
          >
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-1">
                <Label htmlFor={`handle${i}`}>Naamkeuze {i}</Label>
                <Input id={`handle${i}`} name={`handle${i}`} required={i === 1} />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor="socials">Sociale links (één per lijn)</Label>
              <Textarea id="socials" name="socials" rows={3} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="motivation">Korte toelichting</Label>
              <Textarea id="motivation" name="motivation" rows={2} />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              Aanvraag versturen
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {badge(influencer)}
    </div>
    </>
  );
}

/** Dropdown met uitsluitend de door de beheerder goedgekeurde namen. */
function ClaimApprovedHandle() {
  const list = useServerFn(getMyApprovedHandles);
  const claim = useServerFn(claimApprovedHandle);
  const [entries, setEntries] = useState<{ handle: string; status: string }[]>([]);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    list().then(setEntries).catch(() => setEntries([]));
  }, [list]);
  const claimed = entries.find((e) => e.status === "claimed");
  const open = entries.filter((e) => e.status === "approved");
  if (claimed) {
    return <p className="mt-6 text-sm text-muted-foreground">Je verificatie is compleet: rout.be/{claimed.handle}</p>;
  }
  if (open.length === 0) return null;
  return (
    <div className="mt-6 space-y-3 rounded-xl border border-border p-4">
      <p className="text-sm font-medium">Kies je definitieve naam</p>
      <select
        aria-label="Goedgekeurde naam"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      >
        <option value="">Kies een naam…</option>
        {open.map((e) => <option key={e.handle} value={e.handle}>rout.be/{e.handle}</option>)}
      </select>
      <Button
        size="sm"
        disabled={!choice || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await claim({ data: { handle: choice } });
            if (!res.ok) toast.error(res.reason);
            else { toast.success(`rout.be/${res.handle} is van jou`); setEntries(await list()); }
          } catch { toast.error(trI18n.t("ui.369ae34e45")); } finally { setBusy(false); }
        }}
      >
        Naam claimen
      </Button>
    </div>
  );
}
