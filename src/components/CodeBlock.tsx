import { useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  code: string;
  language?: string;
  className?: string;
  /** Render as a collapsed <details> block — ideal for long payloads on mobile. */
  collapsible?: boolean;
  /** Summary title, e.g. "POST /api/public/qr/create". */
  title?: string;
  defaultOpen?: boolean;
  /** Localised labels for the copy button. */
  copyLabel?: string;
  copiedLabel?: string;
}

/** Terminal-style snippet with a one-click copy affordance. */
export function CodeBlock({
  code,
  language = "bash",
  className,
  collapsible = false,
  title,
  defaultOpen = false,
  copyLabel = "Copy",
  copiedLabel = "Copied",
}: Props) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (collapsible) {
    return (
      <details
        open={defaultOpen}
        className={cn("group overflow-hidden rounded-xl border border-border bg-card", className)}
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-xs">
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          <span className="min-w-0 flex-1 truncate font-mono text-foreground">
            {title ?? language}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              copy();
            }}
            aria-label="Copy code"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? copiedLabel : copyLabel}
          </button>
        </summary>
        <pre className="overflow-x-auto whitespace-pre max-w-full border-t border-border bg-neutral-900 px-4 py-3 font-mono text-xs text-neutral-100 [scrollbar-width:thin]">
          <code className="whitespace-pre font-mono">{code}</code>
        </pre>
      </details>
    );
  }

  return (
    <div className={cn("group relative overflow-hidden rounded-xl bg-neutral-900", className)}>
      <div className="flex items-center justify-between rounded-t-xl border-b border-neutral-700/50 bg-neutral-800/80 px-4 py-2 text-[11px] font-mono text-neutral-400">
        <span className="uppercase tracking-widest">{language}</span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy code"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <pre className="max-w-full overflow-x-auto whitespace-pre rounded-b-xl p-4 font-mono text-xs text-neutral-100 [scrollbar-width:thin]">
        <code className="font-mono whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}
