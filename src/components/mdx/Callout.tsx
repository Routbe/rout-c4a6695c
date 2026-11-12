import type { ReactNode } from "react";
import { Info, TriangleAlert, CircleCheck, ShieldAlert } from "lucide-react";
const icons = { info: Info, warning: TriangleAlert, success: CircleCheck, danger: ShieldAlert };
export function Callout({ type = "info", title, children }: { type?: keyof typeof icons; title?: string; children: ReactNode }) {
  const Icon = icons[type];
  return <aside className={`docs-callout docs-callout-${type} not-prose my-7 flex gap-3 rounded-lg border p-5`}><Icon className="mt-0.5 size-5 shrink-0" aria-hidden /><div className="min-w-0 text-sm leading-7">{title && <p className="mb-1 font-semibold text-foreground">{title}</p>}{children}</div></aside>;
}