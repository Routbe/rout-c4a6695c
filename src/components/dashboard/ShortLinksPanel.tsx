import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Link2, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateShortLinkTarget } from "@/lib/short-link-edit.functions";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { paginate } from "@/lib/paginate";
import { i18n as trI18n } from "@/lib/i18n";

interface Row {
  id: string;
  slug: string;
  label: string | null;
  target_url: string;
  created_at: string;
  clicks: number;
}

/** Dashboard-tab "Short Links": tabel met kliks en bewerkbare doel-URL. */
export function ShortLinksPanel() {
  const { user } = useAuth();
  const { locale } = useI18n();
  const update = useServerFn(updateShortLinkTarget);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | null>(null);
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data } = await db
        .from("tracked_qrs")
        .select("id, slug, label, target_url, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      const list = (data ?? []) as Omit<Row, "clicks">[];
      const counts = new Map<string, number>();
      if (list.length) {
        const { data: scans } = await db
          .from("qr_scans")
          .select("tracked_qr_id")
          .in(
            "tracked_qr_id",
            list.map((r) => r.id),
          );
        for (const s of (scans ?? []) as { tracked_qr_id: string }[])
          counts.set(s.tracked_qr_id, (counts.get(s.tracked_qr_id) ?? 0) + 1);
      }
      if (alive) setRows(list.map((r) => ({ ...r, clicks: counts.get(r.id) ?? 0 })));
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      await update({ data: { id: editing.id, targetUrl: url.trim() } });
      setRows((list) => list?.map((r) => (r.id === editing.id ? { ...r, target_url: url.trim() } : r)) ?? null);
      toast.success(trI18n.t("ui.7e3f71eb72"));
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bijwerken is niet gelukt.");
    } finally {
      setSaving(false);
    }
  }

  if (!rows)
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );

  if (rows.length === 0)
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        <Link2 className="mx-auto mb-2 h-5 w-5" aria-hidden />
        Nog geen short links. Maak een dynamische QR om je eerste short link te krijgen.
      </div>
    );

  const view = paginate(rows, page, 10);

  return (
    <section className="rounded-2xl border border-border bg-card p-3.5 sm:p-5">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="py-2 pr-3">Slug</th>
              <th className="py-2 pr-3">Doel-URL</th>
              <th className="py-2 pr-3 text-right">Kliks</th>
              <th className="py-2 pr-3">Aangemaakt</th>
              <th className="py-2 text-right">Acties</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {view.items.map((r) => (
              <tr key={r.id}>
                <td className="py-2 pr-3 font-mono text-xs">rout.be/s/{r.slug}</td>
                <td className="max-w-[16rem] truncate py-2 pr-3 text-xs text-muted-foreground" title={r.target_url}>
                  {r.target_url}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.clicks}</td>
                <td className="py-2 pr-3 text-xs text-muted-foreground">{formatDate(r.created_at, locale)}</td>
                <td className="py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label="Kopieer short link"
                      onClick={() => {
                        void navigator.clipboard.writeText(`https://rout.be/s/${r.slug}`);
                        toast.success(trI18n.t("ui.b6c02560ee"));
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label="Doel-URL bewerken"
                      onClick={() => {
                        setEditing(r);
                        setUrl(r.target_url);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view.pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <Button size="sm" variant="outline" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>
            Vorige
          </Button>
          <span className="text-muted-foreground">
            Pagina {view.page} van {view.pages}
          </span>
          <Button size="sm" variant="outline" disabled={view.page >= view.pages} onClick={() => setPage(view.page + 1)}>
            Volgende
          </Button>
        </div>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Doel-URL aanpassen</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sl-target">Nieuwe bestemming</Label>
            <Input id="sl-target" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            <p className="text-xs text-muted-foreground">De slug en geprinte QR-codes blijven ongewijzigd.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Annuleren
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
