import type { ReactNode } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { cn } from "@/lib/utils";

interface Section {
  id?: string;
  heading: ReactNode;
  body: ReactNode;
  wrapperClassName?: string;
  headingClassName?: string;
}

export function LegalPage({
  title,
  updated,
  subtitle,
  quickJump,
  sections,
  footer,
  card = false,
}: {
  title: string;
  updated: string;
  subtitle?: ReactNode;
  quickJump?: ReactNode;
  sections: Section[];
  footer?: ReactNode;
  /** Wrap the document body in a bordered card with mobile-tight padding. */
  card?: boolean;
}) {
  return (
    <AppLayout crumbs={[{ label: title }]}>
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-16">
        <h1 className="font-serif text-3xl font-medium sm:text-4xl">{title}</h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">{updated}</p>
        {subtitle}
        {quickJump}

        <div
          className={cn(
            card ? "mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-8" : "mt-10",
          )}
        >
          {sections.map((s, i) => (
            <section
              key={i}
              id={s.id}
              className={cn(
                "scroll-mt-24",
                s.wrapperClassName ??
                  "mb-6 border-b border-border/30 pb-6 last:border-b-0 last:mb-0 last:pb-0",
              )}
            >
              {typeof s.heading === "string" ? (
                <h2
                  className={
                    s.headingClassName ?? "font-serif text-lg font-semibold text-foreground"
                  }
                >
                  {s.heading}
                </h2>
              ) : (
                s.heading
              )}
              <div className="mt-2 space-y-3 font-sans text-sm leading-relaxed text-muted-foreground">
                {typeof s.body === "string" ? <p>{s.body}</p> : s.body}
              </div>
            </section>
          ))}
        </div>

        {footer ? <div className="mt-8">{footer}</div> : null}
      </div>
    </AppLayout>
  );
}
