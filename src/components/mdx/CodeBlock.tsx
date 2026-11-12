import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
export function CodeBlock({ code, language = "text", title }: { code: string; language?: string; title?: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setHtml(null);
    void import("shiki/bundle/web").then(m => m.codeToHtml(code, { lang: language, themes: { light: "github-light", dark: "github-dark" }, defaultColor: false })).then(value => { if (alive) setHtml(value); }).catch(() => { if (alive) setHtml(null); });
    return () => { alive = false; };
  }, [code, language]);
  async function copy() { try { await navigator.clipboard.writeText(code); setCopied(true); setFailed(false); setTimeout(() => setCopied(false), 1800); } catch { setFailed(true); } }
  return <figure className="docs-code not-prose my-7 overflow-hidden rounded-lg border border-border"><figcaption className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 text-xs text-muted-foreground"><span className="flex min-w-0 items-center gap-3"><span className="docs-window-dots flex gap-1.5" aria-hidden><i /><i /><i /></span><span className="truncate font-mono">{title ?? language}</span></span><Button variant="ghost" size="icon" onClick={copy} aria-label={copied ? "Code gekopieerd" : "Kopieer code"} title="Kopieer code">{copied ? <Check /> : <Copy />}</Button></figcaption>{html ? <div className="overflow-x-auto p-5 text-xs leading-6" dangerouslySetInnerHTML={{ __html: html }} /> : <pre className="overflow-x-auto p-5 text-xs leading-6"><code>{code}</code></pre>}<span className="sr-only" role="status">{copied ? "Code gekopieerd" : failed ? "Kopiëren niet beschikbaar" : ""}</span></figure>;
}