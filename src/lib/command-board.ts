/** Pure layout rules for the customizable admin Command Center board. */
export type WidgetHeight = "auto" | "s" | "m" | "l";
export type BoardItem = { id: string; w: 1 | 2 | 3 | 4; h: WidgetHeight };
export type BoardLayout = { version: 1; items: BoardItem[] };

export const DEFAULT_LAYOUT: BoardLayout = {
  version: 1,
  items: [
    { id: "members", w: 1, h: "auto" }, { id: "visitors", w: 1, h: "auto" }, { id: "verifications", w: 1, h: "auto" }, { id: "webhooks", w: 1, h: "auto" },
    { id: "actions", w: 1, h: "auto" }, { id: "modules", w: 3, h: "auto" }, { id: "events", w: 4, h: "auto" },
  ],
};

const HEIGHTS: WidgetHeight[] = ["auto", "s", "m", "l"];

/** Drops unknown/duplicate ids and clamps sizes so a stored layout can never break the board. */
export function normalizeLayout(raw: unknown, known: readonly string[]): BoardLayout {
  const items = (raw && typeof raw === "object" && Array.isArray((raw as BoardLayout).items) ? (raw as BoardLayout).items : DEFAULT_LAYOUT.items);
  const seen = new Set<string>();
  const out: BoardItem[] = [];
  for (const it of items) {
    if (!it || typeof it.id !== "string" || !known.includes(it.id) || seen.has(it.id)) continue;
    seen.add(it.id);
    const w = Math.min(4, Math.max(1, Math.round(Number(it.w) || 1))) as BoardItem["w"];
    out.push({ id: it.id, w, h: HEIGHTS.includes(it.h) ? it.h : "auto" });
  }
  return { version: 1, items: out };
}

export function moveItem(layout: BoardLayout, id: string, toIndex: number): BoardLayout {
  const items = [...layout.items];
  const from = items.findIndex((i) => i.id === id);
  if (from < 0) return layout;
  const [it] = items.splice(from, 1);
  items.splice(Math.max(0, Math.min(items.length, toIndex)), 0, it!);
  return { ...layout, items };
}

export function resizeItem(layout: BoardLayout, id: string, patch: Partial<Pick<BoardItem, "w" | "h">>): BoardLayout {
  return normalizeLayout({ items: layout.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }, layout.items.map((i) => i.id));
}

export function addItem(layout: BoardLayout, id: string, known: readonly string[]): BoardLayout {
  if (layout.items.some((i) => i.id === id)) return layout;
  return normalizeLayout({ items: [...layout.items, { id, w: 1, h: "auto" }] }, known);
}

export function removeItem(layout: BoardLayout, id: string): BoardLayout {
  return { ...layout, items: layout.items.filter((i) => i.id !== id) };
}
