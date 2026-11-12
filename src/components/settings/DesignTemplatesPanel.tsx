import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  applyDesignTemplate,
  deleteDesignTemplate,
  listDesignTemplates,
  renameDesignTemplate,
  saveCurrentDesign,
} from "@/lib/design-templates.functions";
import { i18n as trI18n } from "@/lib/i18n";

const KEY = ["design-templates"];

/** Saved card designs: keep several looks and switch back any time. */
export function DesignTemplatesPanel({ compact = false }: { compact?: boolean } = {}) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: KEY, queryFn: useServerFn(listDesignTemplates) });
  const save = useServerFn(saveCurrentDesign);
  const apply = useServerFn(applyDesignTemplate);
  const rename = useServerFn(renameDesignTemplate);
  const remove = useServerFn(deleteDesignTemplate);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await qc.invalidateQueries({ queryKey: KEY });
    } catch {
      toast.error(trI18n.t("ui.cbdcf1f424"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={compact ? "space-y-3" : "space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {compact ? <span /> : (
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <Layers className="h-4 w-4" /> Mijn ontwerpen
          </h2>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => save({ data: {} }), "Huidig ontwerp bewaard.")}>
          <Plus className="h-4 w-4" /> Huidig ontwerp bewaren
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Bewaar je kaart als ontwerp en wissel later terug. Bij wisselen bewaren we je huidige ontwerp automatisch.
      </p>
      {list.data?.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {list.data.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 p-3">
              {editing && editing.id === t.id ? (
                <form className="flex flex-1 gap-2" onSubmit={(e) => {
                  e.preventDefault();
                  const name = editing.name;
                  setEditing(null);
                  void run(() => rename({ data: { id: t.id, name } }), "Naam aangepast.");
                }}>
                  <Input value={editing.name} maxLength={60} className="h-9"
                    onChange={(e) => setEditing({ id: t.id, name: e.target.value })} />
                  <Button size="sm" type="submit" variant="ghost" aria-label="Opslaan"><Check className="h-4 w-4" /></Button>
                </form>
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</p>
                </div>
              )}
              <Button size="sm" disabled={busy} onClick={() => run(() => apply({ data: { id: t.id } }), `${t.name} staat nu op je kaart.`)}>
                Gebruiken
              </Button>
              <Button size="sm" variant="ghost" aria-label="Naam wijzigen" onClick={() => setEditing({ id: t.id, name: t.name })}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" aria-label="Verwijderen" disabled={busy}
                onClick={() => window.confirm(`${t.name} verwijderen?`) && run(() => remove({ data: { id: t.id } }), "Ontwerp verwijderd.")}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">Nog geen bewaarde ontwerpen.</p>
      )}
    </section>
  );
}
