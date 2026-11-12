import { i18n as trI18n } from "@/lib/i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CodeBlock } from "@/components/CodeBlock";
import { StatusWidget } from "@/components/StatusWidget";
import { OAuthConsole } from "@/components/dev/OAuthConsole";
import { MCP_TOOLS, type McpToolDef } from "@/lib/mcp-tools";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-keys.functions";
import {
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Gauge,
  Globe,
  KeyRound,
  Lock,
  Loader2,
  Play,
  Plus,
  Plug,
  ShieldCheck,
  Terminal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OpenApiSpecSheet } from "@/components/OpenApiSpecSheet";

interface KeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  rate_limit: number;
  request_count: number;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

const FALLBACK_ORIGIN = "https://rout.be";

/**
 * Snippets must quote the host the developer is actually on, but SSR has no
 * `window`. Rendering the fallback first and swapping after hydration keeps the
 * markup identical on both sides while still showing the real origin.
 */
function useOrigin() {
  const [value, setValue] = useState(FALLBACK_ORIGIN);
  useEffect(() => setValue(window.location.origin), []);
  return value;
}

function ToolTester({ tool }: { tool: McpToolDef }) {
  const [args, setArgs] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      tool.params.map((p) => [
        p.name,
        typeof tool.sampleInput[p.name] === "object"
          ? JSON.stringify(tool.sampleInput[p.name])
          : String(tool.sampleInput[p.name] ?? ""),
      ]),
    ),
  );
  const [running, setRunning] = useState(false);
  const [res, setRes] = useState<{ status: number; ms: number; body: string } | null>(null);

  const run = async () => {
    setRunning(true);
    const started = performance.now();
    try {
      const parsed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(args)) {
        if (v === "") continue;
        try {
          parsed[k] = JSON.parse(v) as unknown;
        } catch {
          parsed[k] = v;
        }
      }
      const r = await fetch("/api/public/mcp/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: tool.name, args: parsed }),
      });
      const body = await r.text();
      setRes({ status: r.status, ms: Math.round(performance.now() - started), body });
    } catch (e) {
      setRes({
        status: 0,
        ms: Math.round(performance.now() - started),
        body: JSON.stringify({ error: e instanceof Error ? e.message : "Request failed" }, null, 2),
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="eyebrow">Try it now</p>
        <Badge variant="outline" className="text-[10px]">
          sandbox
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {tool.params.map((p) => (
          <div key={p.name} className="space-y-1">
            <Label htmlFor={`${tool.name}-${p.name}`} className="font-mono text-[11px]">
              {p.name}
              {p.required && <span className="text-muted-foreground"> *</span>}
            </Label>
            <Input
              id={`${tool.name}-${p.name}`}
              value={args[p.name] ?? ""}
              onChange={(e) => setArgs((a) => ({ ...a, [p.name]: e.target.value }))}
              className="h-9 font-mono text-xs"
              placeholder={p.type === "enum" ? p.values?.join(" | ") : p.type}
            />
          </div>
        ))}
        {tool.params.length === 0 && (
          <p className="text-xs text-muted-foreground">This tool takes no parameters.</p>
        )}
      </div>

      <Button onClick={run} disabled={running} size="sm" className="mt-3 w-full gap-2 sm:w-auto">
        {running ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
        Run test
      </Button>

      {res && (
        <div className="mt-3 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <Badge
              variant="outline"
              className={`font-mono text-[10px] ${res.status >= 200 && res.status < 300 ? "border-primary/40 text-foreground" : "text-destructive"}`}
            >
              {res.status === 0
                ? "network error"
                : `${res.status} ${res.status < 300 ? "OK" : ""}`.trim()}
            </Badge>
            <span className="text-muted-foreground">{res.ms} ms</span>
          </div>
          <CodeBlock language="json" code={res.body} />
        </div>
      )}
    </div>
  );
}

/**
 * One collapsible card per tool. Everything below the header is unmounted while
 * collapsed, so the tools tab is a short scannable list on a phone instead of a
 * kilometre of scroll.
 */
function ToolCard({ tool }: { tool: McpToolDef }) {
  return (
    <AccordionItem
      value={tool.name}
      className="rounded-2xl border border-border bg-card px-4 sm:px-5"
    >
      <AccordionTrigger className="py-4 hover:no-underline">
        <div className="min-w-0 flex-1 pr-2 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-sm text-foreground">{tool.name}</h3>
            <Badge variant="outline" className="text-[10px]">
              {tool.readOnly ? "read-only" : "write"}
            </Badge>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">{tool.description}</p>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4 pb-4">
          {tool.params.length > 0 && (
            <div className="-mx-1 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Parameter</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Required</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {tool.params.map((p) => (
                    <tr key={p.name} className="border-t border-border align-top">
                      <td className="px-3 py-2 font-mono text-foreground">{p.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {p.type === "enum" ? p.values?.join(" | ") : p.type}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {p.required ? "yes" : "no"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-1.5">
              <CodeBlock
                collapsible
                title={`Example call — ${tool.name}`}
                language="json"
                code={JSON.stringify(tool.sampleInput, null, 2)}
              />
            </div>
            <div className="space-y-1.5">
              <CodeBlock
                collapsible
                title="Example response"
                language="json"
                code={JSON.stringify(tool.sampleOutput, null, 2)}
              />
            </div>
          </div>
          <ToolTester tool={tool} />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function TestConsole() {
  const [tool, setTool] = useState(MCP_TOOLS[0].name);
  const active = MCP_TOOLS.find((t) => t.name === tool)!;
  const [body, setBody] = useState(JSON.stringify(active.sampleInput, null, 2));
  const [result, setResult] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const pick = (name: string) => {
    const next = MCP_TOOLS.find((t) => t.name === name)!;
    setTool(name);
    setBody(JSON.stringify(next.sampleInput, null, 2));
    setResult(null);
  };

  const run = async () => {
    setRunning(true);
    try {
      const args = JSON.parse(body || "{}") as Record<string, unknown>;
      const res = await fetch("/api/public/mcp/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, args }),
      });
      setResult(await res.text());
    } catch (e) {
      setResult(
        JSON.stringify({ error: e instanceof Error ? e.message : "Invalid JSON" }, null, 2),
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-display text-xl text-foreground">Test console</h2>
        <Badge variant="outline" className="text-[10px]">
          sandbox
        </Badge>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Fire a tool call and inspect the response shape. Sandbox calls never touch your live QR
        codes.
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {MCP_TOOLS.map((t) => (
          <button
            key={t.name}
            type="button"
            onClick={() => pick(t.name)}
            className={`rounded-full border px-3 py-1 font-mono text-[11px] transition-colors ${
              t.name === tool
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:bg-muted/60"
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mcp-args">Arguments (JSON)</Label>
          {/* Compact on a phone (the editor must not eat the viewport), roomy on
              a laptop where the response sits next to it. */}
          <Textarea
            id="mcp-args"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
            className="min-h-[132px] resize-y font-mono text-xs sm:min-h-[220px] lg:min-h-[280px]"
          />
          <Button onClick={run} disabled={running} className="mt-1 w-full gap-2 sm:w-auto">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run tool
          </Button>
        </div>
        <div className="space-y-1.5">
          <Label>Response</Label>
          {result ? (
            <div className="max-h-[60vh] overflow-auto rounded-xl">
              <CodeBlock language="json" code={result} />
            </div>
          ) : (
            <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground lg:min-h-[220px]">
              Run a tool to see the response here.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const SCOPES = [
  "qr:read",
  "qr:write",
  "links:read",
  "links:write",
  "analytics:read",
  "domains:read",
] as const;

export function ApiKeys() {
  const [rows, setRows] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [scopes, setScopes] = useState<string[]>([
    "qr:read",
    "qr:write",
    "links:read",
    "links:write",
  ]);

  const toggleScope = (s: string) =>
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const load = useCallback(async () => {
    try {
      setRows((await listApiKeys()) as KeyRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load your keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!name.trim() || scopes.length === 0) return;
    setCreating(true);
    try {
      const res = await createApiKey({
        data: { name: name.trim(), scopes: scopes as "qr:read"[] },
      });
      setFresh(res.key);
      setName("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the key");
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-display text-xl text-foreground">API keys</h2>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Keys authenticate both the REST API and the MCP server. We store a hash only — the full
          key is shown once, right after you create it.
        </p>
        <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">AI agents never get a static key</p>
          <p className="mt-1">
            Agents connect through <a className="underline" href="/connect">/connect</a> and receive tokens that expire
            within one hour, with only the scopes you approve: <code>assets:write</code>, <code>profile:draft</code>,{" "}
            <code>identity:read_public</code>. Revoke an agent at any time under Connected apps. Scopes for an agent app are
            set in the Developer Console → Scopes.
          </p>
        </div>

        {/* Which key belongs where: the single most common cause of leaked
            credentials is a backend key pasted into browser code. */}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <p className="text-xs font-semibold text-foreground">Public identifiers</p>
              <Badge variant="outline" className="text-[10px]">
                safe in the browser
              </Badge>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Short links, <code className="font-mono">rout.be/u/@handle</code> profiles and the
              OpenAPI spec URL are public by design. They may appear in front-end code, QR codes and
              documentation.
            </p>
          </div>
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-destructive" aria-hidden />
              <p className="text-xs font-semibold text-foreground">
                Secret keys (<code className="font-mono">rout_sk_…</code>)
              </p>
              <Badge
                variant="outline"
                className="border-destructive/40 text-[10px] text-destructive"
              >
                server-side only
              </Badge>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              These carry your scopes and act on your account. Keep them in server environment
              variables or your MCP client config — never in front-end code, a public repository or
              a browser <code className="font-mono">fetch</code>. Revoke instantly if exposed.
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="eyebrow mr-1">Scopes</p>
            <Button variant="outline" size="sm" onClick={() => setScopes([...SCOPES])}>
              Select all
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setScopes(SCOPES.filter((s) => s.endsWith(":read")))}
            >
              Read-only preset
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SCOPES.map((s) => {
              const on = scopes.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleScope(s)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] transition-colors ${
                    on
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  {on ? <Check className="h-3 w-3" /> : <span className="h-3 w-3" />}
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            placeholder="Key name, e.g. Claude Desktop"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void create();
              }
            }}
          />
          <Button
            onClick={create}
            disabled={creating || !name.trim() || scopes.length === 0}
            className="gap-2"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create key
          </Button>
        </div>

        {fresh && (
          <div className="mt-4 space-y-2 rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium text-foreground">
              Copy this key now — it will never be shown again.
            </p>
            <CodeBlock language="key" code={fresh} />
            <Button variant="ghost" size="sm" onClick={() => setFresh(null)}>
              I saved it
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-14">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <KeyRound className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">No API keys yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Create your first key to connect an AI assistant or your own backend to ROUT.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Key</th>
                <th className="px-4 py-2.5 font-medium">Scopes</th>
                <th className="px-4 py-2.5 font-medium">Usage</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-3 text-foreground">{row.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {row.key_prefix}…
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                    {(row.scopes ?? []).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {row.request_count} / {row.rate_limit} req per min
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-[10px]">
                      {row.revoked_at ? "revoked" : "active"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!row.revoked_at && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Revoke ${row.name}`}
                        onClick={async () => {
                          await revokeApiKey({ data: { id: row.id } });
                          toast.success(trI18n.t("ui.05d7aa7002"));
                          await load();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Canonical, always-quotable spec URL for AI agents and integrators. */
const OPENAPI_SPEC_URL = "https://rout.be/api/public/openapi.json";
const OPENAPI_SPEC_PATH = "/api/public/openapi.json";

export default function DeveloperHub() {
  const { user, loading, available } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && !user) nav("/auth/sign-in", { replace: true });
  }, [user, loading, nav]);

  const base = useOrigin();
  const [specSheetOpen, setSpecSheetOpen] = useState(false);

  const handleCopyOpenApiUrl = () => {
    void navigator.clipboard.writeText(OPENAPI_SPEC_URL);
    toast.success(trI18n.t("ui.48cb18efed"));
  };

  const handleDownloadOpenApi = async () => {
    try {
      const res = await fetch(OPENAPI_SPEC_PATH);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "openapi.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(trI18n.t("ui.c98e2bbf8c"));
    }
  };

  const snippets = useMemo(
    () => ({
      config: JSON.stringify(
        {
          mcpServers: {
            rout: {
              command: "npx",
              args: ["-y", "@routbe/mcp-server"],
              env: { ROUT_API_KEY: "rout_sk_your_key_here" },
            },
          },
        },
        null,
        2,
      ),
      curl: `curl --fail-with-body -X POST ${base}/api/public/qr/create \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $ROUT_API_KEY" \\
  -d '{"target_type":"url","target_url":"https://delplanche.com","label":"Summer campaign"}'`,
      node: `const ROUT_API = "${base}";

async function createQr() {
  try {
    const res = await fetch(\`\${ROUT_API}/api/public/qr/create\`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: \`Bearer \${process.env.ROUT_API_KEY}\`,
      },
      body: JSON.stringify({
        target_type: "url",
        target_url: "https://delplanche.com",
        label: "Summer campaign",
      }),
    });

    // fetch() only rejects on network errors — check the status yourself.
    if (!res.ok) {
      const body = await res.text();
      throw new Error(\`ROUT API \${res.status}: \${body}\`);
    }

    const { short_url, dashboard_token } = await res.json();
    return { short_url, dashboard_token };
  } catch (error) {
    console.error("Could not create the QR code:", error);
    throw error;
  }
}`,
      python: `import os
import requests

ROUT_API = "${base}"

def create_qr():
    try:
        res = requests.post(
            f"{ROUT_API}/api/public/qr/create",
            headers={"Authorization": f"Bearer {os.environ['ROUT_API_KEY']}"},
            json={
                "target_type": "url",
                "target_url": "https://delplanche.com",
                "label": "Summer campaign",
            },
            timeout=10,
        )
        res.raise_for_status()  # 4xx/5xx never pass silently
        return res.json()
    except requests.HTTPError as error:
        print("ROUT API rejected the request:", error.response.status_code, error.response.text)
        raise
    except requests.RequestException as error:
        print("Could not reach the ROUT API:", error)
        raise

print(create_qr())`,
    }),
    [base],
  );

  return (
    <AppLayout crumbs={[{ label: "API & developer hub" }]}>
      <header>
        <span className="eyebrow">Developer hub</span>
        <h1 className="mt-2 font-display text-3xl text-foreground">API &amp; MCP endpoints</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Everything an AI assistant or your own backend needs to create QR codes, repoint dynamic
          links and read scan analytics — over REST or the Model Context Protocol.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <StatusWidget />
          {!available && (
            <span
              data-testid="sandbox-indicator"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
            >
              Sandbox mode — backend keys not configured
            </span>
          )}

          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Gauge className="h-3.5 w-3.5" /> 60 requests per minute per key
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Bearer token authentication
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid="openapi-menu-trigger"
                className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary/70"
              >
                OpenAPI 3.1 Spec
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => setSpecSheetOpen(true)}>
                <BookOpen className="h-4 w-4" />
                Explore interactive reference
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="openapi-copy" onSelect={handleCopyOpenApiUrl}>
                <Copy className="h-4 w-4" />
                Copy OpenAPI URL
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="openapi-download" onSelect={handleDownloadOpenApi}>
                <Download className="h-4 w-4" />
                Download openapi.json
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={OPENAPI_SPEC_PATH}
                  data-testid="openapi-raw"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-default"
                >
                  <ExternalLink className="h-4 w-4" />
                  View raw JSON
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <OpenApiSpecSheet open={specSheetOpen} onOpenChange={setSpecSheetOpen} />
        </div>
      </header>

      <Tabs defaultValue="mcp" className="mt-8">
        <TabsList>
          <TabsTrigger value="mcp">MCP</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="keys">API keys</TabsTrigger>
          <TabsTrigger value="oauth">Login met ROUT</TabsTrigger>
          <TabsTrigger value="quickstart">Quickstart</TabsTrigger>
        </TabsList>

        <TabsContent value="mcp" className="mt-6 space-y-5">
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-display text-xl text-foreground">Connect an AI assistant</h2>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Add this block to your Claude Desktop or Cursor MCP configuration, restart the client,
              and the six ROUT tools appear automatically.
            </p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="space-y-1.5">
                <p className="eyebrow">claude_desktop_config.json</p>
                <CodeBlock language="json" code={snippets.config} />
              </div>
              <div className="space-y-1.5">
                <p className="eyebrow">Endpoints</p>
                <div className="space-y-2">
                  {[
                    ["POST", "/api/public/qr/create", "Create a dynamic QR + short link"],
                    ["POST", "/api/public/qr/manage", "Update, pause or repoint a dynamic QR"],
                    ["GET", "/api/public/qr/stats", "Scan analytics (JSON or CSV)"],
                    ["GET", "/api/public/health", "Service health probe"],
                  ].map(([method, path, desc]) => (
                    <div
                      key={path}
                      className="rounded-xl border border-border bg-muted/40 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {method}
                        </Badge>
                        <code className="break-all font-mono text-xs text-foreground">{path}</code>
                        <button
                          type="button"
                          aria-label={`Copy ${path}`}
                          className="ml-auto text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            void navigator.clipboard.writeText(`${base}${path}`);
                            toast.success(trI18n.t("ui.308eddda64"));
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <TestConsole />
        </TabsContent>

        <TabsContent value="tools" className="mt-6 space-y-3">
          <p className="text-sm text-muted-foreground">
            Six tools are exposed by{" "}
            <code className="font-mono text-foreground">@routbe/mcp-server</code>.
          </p>
          <Accordion type="single" collapsible className="space-y-3">
            {MCP_TOOLS.map((tool) => (
              <ToolCard key={tool.name} tool={tool} />
            ))}
          </Accordion>
        </TabsContent>

        <TabsContent value="keys" className="mt-6">
          <ApiKeys />
        </TabsContent>

        <TabsContent value="oauth" className="mt-6">
          <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-6">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl text-foreground">Login met ROUT</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Apps, sleutels, redirects en beveiliging beheer je in de Developer Console.
              </p>
            </div>
            <Button asChild>
              <a href="/console/apps">Open Console →</a>
            </Button>
          </section>
        </TabsContent>

        <TabsContent value="quickstart" className="mt-6 space-y-5">
          <p className="text-sm text-muted-foreground">
            Every snippet targets <code className="font-mono text-foreground">{base}</code> — the
            origin you are on right now.
          </p>
          <CodeBlock
            collapsible
            defaultOpen
            title="cURL — POST /api/public/qr/create"
            language="bash"
            code={snippets.curl}
          />
          <CodeBlock
            collapsible
            title="Node.js — create a dynamic QR"
            language="typescript"
            code={snippets.node}
          />
          <CodeBlock
            collapsible
            title="Python — create a dynamic QR"
            language="python"
            code={snippets.python}
          />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
