import { createFileRoute } from "@tanstack/react-router";
import { Bot, CheckCircle2, Copy, Terminal } from "lucide-react";
import { toast } from "sonner";
import { ConsoleCard, ConsolePage } from "@/components/console/ConsolePage";
import { Button } from "@/components/ui/button";
import { i18n as trI18n } from "@/lib/i18n";

const config = `{
  "mcpServers": {
    "rout": {
      "command": "npx",
      "args": ["-y", "@routbe/mcp-server"],
      "env": { "ROUT_API_KEY": "rout_sk_your_key_here" }
    }
  }
}`;

export const Route = createFileRoute("/_authenticated/console/connectors")({
  head: () => ({ meta: [
    { title: "AI & MCP Connectors | ROUT Console" }, { name: "description", content: "Verbind Claude, Cursor en andere MCP-clients met ROUT." },
    { property: "og:title", content: "AI & MCP Connectors | ROUT Console" }, { property: "og:description", content: "ROUT-tools voor AI-assistenten via MCP." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex,nofollow" },
  ]}), component: ConnectorsConsole,
});

function ConnectorsConsole() {
  return <ConsolePage title="AI & MCP Connectors" description="Connect Claude Desktop, Cursor and compatible agents to ROUT tools.">
    <div className="grid gap-4 lg:grid-cols-2">
      <ConsoleCard title="MCP configuration" description="Add this server block to your AI client, then restart it.">
        <div className="relative"><pre className="overflow-x-auto border border-border bg-background p-4 text-xs leading-relaxed"><code>{config}</code></pre><Button size="icon" variant="ghost" className="absolute right-2 top-2" aria-label="Kopieer configuratie" onClick={() => { void navigator.clipboard.writeText(config); toast.success(trI18n.t("ui.4fbfe74a73")); }}><Copy className="h-4 w-4" /></Button></div>
      </ConsoleCard>
      <ConsoleCard title="Compatible clients" description="Use the same ROUT server in each MCP-compatible desktop client.">
        <ul className="space-y-3 text-sm">{["Claude Desktop", "Cursor", "Custom MCP clients"].map((name) => <li key={name} className="flex items-center gap-3 border-b border-border pb-3 last:border-0"><CheckCircle2 className="h-4 w-4 text-accent" />{name}</li>)}</ul>
      </ConsoleCard>
      <ConsoleCard title="Available workflows" description="Create and manage ROUT resources from an assistant.">
        <div className="grid gap-3 sm:grid-cols-2">{["Create QR codes", "Repoint dynamic links", "Read scan analytics", "Check service health"].map((label) => <div key={label} className="flex items-center gap-2 border border-border bg-background px-3 py-3 text-sm"><Bot className="h-4 w-4 text-muted-foreground" />{label}</div>)}</div>
      </ConsoleCard>
      <ConsoleCard title="Authentication" description="Create a scoped key on the API Keys page.">
        <p className="flex items-start gap-3 text-sm text-muted-foreground"><Terminal className="mt-0.5 h-4 w-4 shrink-0" />Store ROUT_API_KEY in the client configuration. Never commit it to a repository.</p>
      </ConsoleCard>
    </div>
  </ConsolePage>;
}