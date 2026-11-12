import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Terminal-style code block with a copy button (console docs + quick start). */
export function CodeBlock({ code, label, prompt = false }: { code: string; label?: string; prompt?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{label ?? "code"}</span>
        <button
          type="button"
          aria-label="Kopieer code"
          onClick={() => {
            void navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Gekopieerd" : "Kopieer"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-foreground">
        {prompt && <span className="select-none text-muted-foreground">$ </span>}
        {code}
      </pre>
    </div>
  );
}
