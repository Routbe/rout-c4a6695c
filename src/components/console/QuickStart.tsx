import { Terminal } from "lucide-react";
import { CodeBlock } from "./CodeBlock";

/** Neon-style terminal onboarding card. The CLI package is not published yet. */
export function QuickStart() {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Terminal className="h-5 w-5" />
        <h2 className="text-base font-medium">Quick Start</h2>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          Coming soon
        </span>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Initialize your app configuration or connect your AI assistant instantly from your terminal.
      </p>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <CodeBlock label="init app" code="npx routbe@latest init" prompt />
        <CodeBlock label="mcp server" code="npx routbe@latest mcp-server" prompt />
      </div>
    </section>
  );
}
