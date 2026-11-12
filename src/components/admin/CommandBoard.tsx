import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, GripVertical, LayoutGrid, Minus, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addItem, DEFAULT_LAYOUT, moveItem, normalizeLayout, removeItem, resizeItem, type BoardLayout, type WidgetHeight } from "@/lib/command-board";

export type BoardWidget = { id: string; title: string; render: () => ReactNode };

const STORAGE_KEY = "rout.command-board.v1";
const SPAN = { 1: "lg:col-span-1", 2: "lg:col-span-2", 3: "lg:col-span-3", 4: "lg:col-span-4" } as const;
const MD_SPAN = { 1: "md:col-span-1", 2: "md:col-span-2", 3: "md:col-span-2", 4: "md:col-span-2" } as const;
const HEIGHT: Record<WidgetHeight, string> = { auto: "", s: "lg:h-40", m: "lg:h-80", l: "lg:h-[32rem]" };
const HEIGHT_LABEL: Record<WidgetHeight, string> = { auto: "Auto", s: "Laag", m: "Middel", l: "Hoog" };

export function CommandBoard({ widgets }: { widgets: BoardWidget[] }) {
  const known = widgets.map((w) => w.id);
  const [layout, setLayout] = useState<BoardLayout>(() => normalizeLayout(DEFAULT_LAYOUT, known));
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  useEffect(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) setLayout(normalizeLayout(JSON.parse(raw), known)); } catch { /* keep default */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const update = (next: BoardLayout) => { setLayout(next); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode */ } };
  const byId = new Map(widgets.map((w) => [w.id, w]));
  const hidden = widgets.filter((w) => !layout.items.some((i) => i.id === w.id));

  return <div>
    <div className="mb-6 flex flex-wrap items-center justify-end gap-2">
      {editing && <Button variant="ghost" size="sm" onClick={() => update(normalizeLayout(DEFAULT_LAYOUT, known))}><RotateCcw /> Standaard</Button>}
      <Button variant={editing ? "default" : "outline"} size="sm" onClick={() => setEditing((e) => !e)} aria-pressed={editing}><LayoutGrid /> {editing ? "Klaar" : "Indeling aanpassen"}</Button>
    </div>
    {editing && hidden.length > 0 && <div className="mb-6 rounded-2xl border border-dashed border-border p-4">
      <p className="mb-3 text-sm font-medium">Widget toevoegen</p>
      <div className="flex flex-wrap gap-2">{hidden.map((w) => <Button key={w.id} variant="outline" size="sm" onClick={() => update(addItem(layout, w.id, known))}><Plus /> {w.title}</Button>)}</div>
    </div>}
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      {layout.items.map((item, index) => {
        const widget = byId.get(item.id);
        if (!widget) return null;
        return <div key={item.id}
          className={cn("relative min-w-0", SPAN[item.w], MD_SPAN[item.w], HEIGHT[item.h], item.h !== "auto" && "lg:overflow-auto", editing && "rounded-2xl ring-1 ring-border ring-offset-4 ring-offset-background", dragId === item.id && "opacity-50")}
          draggable={editing}
          onDragStart={() => setDragId(item.id)}
          onDragEnd={() => setDragId(null)}
          onDragOver={(e) => { if (editing && dragId) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== item.id) update(moveItem(layout, dragId, index)); setDragId(null); }}>
          {editing && <div className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1.5 text-xs">
            <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" aria-hidden />
            <span className="mr-auto truncate font-medium">{widget.title}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Naar voren" disabled={index === 0} onClick={() => update(moveItem(layout, item.id, index - 1))}><ArrowLeft /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Naar achteren" disabled={index === layout.items.length - 1} onClick={() => update(moveItem(layout, item.id, index + 1))}><ArrowRight /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Smaller" disabled={item.w === 1} onClick={() => update(resizeItem(layout, item.id, { w: (item.w - 1) as 1 }))}><Minus /></Button>
            <span className="w-8 text-center tabular-nums" aria-label="Breedte">{item.w}/4</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Breder" disabled={item.w === 4} onClick={() => update(resizeItem(layout, item.id, { w: (item.w + 1) as 2 }))}><Plus /></Button>
            <select aria-label="Hoogte" value={item.h} onChange={(e) => update(resizeItem(layout, item.id, { h: e.target.value as WidgetHeight }))} className="h-7 rounded-md border border-border bg-background px-1.5">
              {(Object.keys(HEIGHT_LABEL) as WidgetHeight[]).map((h) => <option key={h} value={h}>{HEIGHT_LABEL[h]}</option>)}
            </select>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`${widget.title} verwijderen`} onClick={() => update(removeItem(layout, item.id))}><X /></Button>
          </div>}
          {widget.render()}
        </div>;
      })}
    </div>
  </div>;
}
