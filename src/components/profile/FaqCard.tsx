import type { CSSProperties } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { FaqConfig } from "@/lib/interactions";

/** Publieke FAQ: inklapbare vraag/antwoord-lijst. */
export function FaqCard({ config, style }: { config: FaqConfig; style?: CSSProperties }) {
  const items = config.items.filter((i) => i.q.trim());
  if (!items.length) return null;

  return (
    <div
      className="w-full overflow-hidden rounded-2xl border border-zinc-200/80 p-4 text-left shadow-sm"
      style={style}
    >
      {config.title && <p className="text-sm font-semibold">{config.title}</p>}
      <Accordion type="single" collapsible className="mt-1">
        {items.map((item, i) => (
          <AccordionItem key={`${item.q}-${i}`} value={`item-${i}`}>
            <AccordionTrigger className="text-left text-sm">{item.q}</AccordionTrigger>
            <AccordionContent className="whitespace-pre-line text-sm opacity-80">
              {item.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
