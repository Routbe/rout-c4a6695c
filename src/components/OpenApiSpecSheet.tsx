import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/CodeBlock";
import { API_ENDPOINTS } from "@/lib/api-endpoints";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const methodStyles: Record<string, string> = {
  GET: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  POST: "bg-blue-500/10 text-blue-600 border-blue-500/20",
};

/** In-app, searchable reference for the public REST API — an alternative to raw JSON. */
export function OpenApiSpecSheet({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return API_ENDPOINTS;
    return API_ENDPOINTS.filter(
      (e) =>
        e.path.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.method.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border px-6 py-5 text-left">
          <SheetTitle>Interactive API reference</SheetTitle>
          <SheetDescription>
            Every public REST endpoint, request payload and response shape — searchable.
          </SheetDescription>
          <div className="relative mt-2">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by path, summary or method…"
              aria-label="Search API endpoints"
              className="pl-9"
            />
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">No endpoints match "{query}".</p>
          )}

          {filtered.map((endpoint) => (
            <div
              key={endpoint.path + endpoint.method}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={`rounded-full font-mono text-[11px] ${methodStyles[endpoint.method] ?? ""}`}
                >
                  {endpoint.method}
                </Badge>
                <code className="text-sm font-medium text-foreground">{endpoint.path}</code>
                {endpoint.auth && (
                  <span className="ml-auto text-[11px] text-muted-foreground">{endpoint.auth}</span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{endpoint.description}</p>

              {endpoint.requestExample && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-medium text-foreground">Request</p>
                  <CodeBlock
                    code={endpoint.requestExample}
                    language="json"
                    title={`${endpoint.method} ${endpoint.path}`}
                  />
                </div>
              )}

              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-foreground">Response</p>
                <CodeBlock code={endpoint.responseExample} language="json" />
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
