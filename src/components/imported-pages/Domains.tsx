import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  Clock,
  Copy,
  Globe,
  Loader2,
  RefreshCw,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  addCustomDomain,
  deleteCustomDomain,
  listCustomDomains,
  setDefaultDomain,
  setDomainShortLinks,
  verifyCustomDomain,
  DOMAIN_CNAME_TARGET,
  DOMAIN_A_TARGET,
} from "@/lib/domains.functions";
import { i18n as trI18n } from "@/lib/i18n";

interface DomainRow {
  id: string;
  domain: string;
  status: string;
  is_default: boolean;
  verification_token: string;
  short_links_enabled: boolean;
  verified_at: string | null;
  last_checked_at: string | null;
  created_at: string;
}

type LiveState = "ok" | "propagating" | "missing";

interface LiveResult {
  state: LiveState;
  txt: boolean;
  route: boolean;
}

type DnsProvider = "standard" | "cloudflare" | "transip";

const STATUS: Record<string, { label: string; tone: string; icon: typeof Clock }> = {
  pending: {
    label: "🟡 Pending Verification",
    tone: "bg-muted text-muted-foreground",
    icon: Clock,
  },
  pointing: {
    label: "Ownership OK · routing missing",
    tone: "bg-muted text-foreground",
    icon: Clock,
  },
  verified: { label: "✅ Live", tone: "bg-foreground text-background", icon: CheckCircle2 },
};

const LIVE: Record<LiveState, { dot: string; title: string; body: string; icon: typeof Clock }> = {
  ok: {
    dot: "bg-emerald-500",
    title: "Active & connected",
    body: "Domain is verified and operational.",
    icon: CheckCircle2,
  },
  propagating: {
    dot: "bg-amber-500",
    title: "Pending (propagation)",
    body: "Records found, waiting for worldwide propagation…",
    icon: Clock,
  },
  missing: {
    dot: "bg-red-500",
    title: "Not found",
    body: "No TXT/CNAME record found yet. Check your DNS settings.",
    icon: XCircle,
  },
};

/** A subdomain has more than two labels (e.g. atproto.j.delplanche.com); a root
 *  domain has exactly two (e.g. delplanche.com). Root domains need an A record,
 *  subdomains only ever need the CNAME. */
function isSubdomain(domain: string) {
  return domain.split(".").length > 2;
}

function copy(value: string, what: string) {
  void navigator.clipboard.writeText(value);
  toast.success(`Copied! · ${what}`);
}

/** One monospace DNS value with its own copy button. */
function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {hint ? <span className="truncate text-[10px] text-muted-foreground">{hint}</span> : null}
      </div>
      <div className="mt-1 flex items-start gap-1.5">
        <code className="min-w-0 flex-1 break-all rounded bg-muted/50 p-2 font-mono text-xs text-foreground">
          {value}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label={`Copy ${label}`}
          onClick={() => copy(value, label)}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Compact DNS record card: TYPE / HOST / VALUE, each copyable. The host is
 *  derived from the selected DNS provider so there is a single source of truth. */
function RecordCard({
  type,
  host,
  value,
  note,
}: {
  type: string;
  host: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="font-mono text-[10px]">
          {type}
        </Badge>
        {note ? (
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">{note}</span>
        ) : null}
      </div>
      <div className="mt-2 space-y-2.5">
        <CopyField label="Host" value={host} />
        <CopyField label="Value" value={value} />
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-medium text-background">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <div className="space-y-2 text-xs text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

/** Browser-side DNS-over-HTTPS lookup so "Check DNS" shows live truth instantly. */
async function dohLookup(name: string, type: "TXT" | "CNAME" | "A"): Promise<string[]> {
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
      { headers: { accept: "application/dns-json" } },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { Answer?: { type: number; data: string }[] };
    return (json.Answer ?? []).map((a) => a.data.replace(/^"|"$/g, "").replace(/\.$/, ""));
  } catch {
    return [];
  }
}

async function liveCheck(row: DomainRow): Promise<LiveResult> {
  const [txt, cname, a] = await Promise.all([
    dohLookup(`_rout.${row.domain}`, "TXT"),
    dohLookup(row.domain, "CNAME"),
    dohLookup(row.domain, "A"),
  ]);
  const txtOk = txt.some((v) => v === row.verification_token);
  const routeOk =
    cname.some((v) => v === DOMAIN_CNAME_TARGET) || a.some((v) => v === DOMAIN_A_TARGET);
  return {
    txt: txtOk,
    route: routeOk,
    state: txtOk && routeOk ? "ok" : txtOk || routeOk ? "propagating" : "missing",
  };
}

export default function Domains() {
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<DomainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState("");
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, LiveResult>>({});
  const [provider, setProvider] = useState<DnsProvider>("standard");

  useEffect(() => {
    if (!authLoading && !user) nav("/auth/sign-in", { replace: true });
  }, [user, authLoading, nav]);

  const load = useCallback(async () => {
    try {
      const data = (await listCustomDomains()) as unknown as DomainRow[];
      setRows(data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load your domains");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const add = async () => {
    const value = domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (!value) return;
    setAdding(true);
    try {
      await addCustomDomain({ data: { domain: value } });
      setDomain("");
      toast.success(trI18n.t("ui.02fc552dc0"));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add that domain");
    } finally {
      setAdding(false);
    }
  };

  const verify = async (row: DomainRow) => {
    setChecking(row.id);
    try {
      // Live DoH lookup first: instant feedback, then the authoritative server check.
      const result = await liveCheck(row);
      setLive((prev) => ({ ...prev, [row.id]: result }));
      toast[result.state === "ok" ? "success" : "message"](LIVE[result.state].body);
      await verifyCustomDomain({ data: { id: row.id } });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setChecking(null);
    }
  };

  // Once a domain exists and is pending or already active, collapse the setup UI
  // by default so the active domain + its verification take center stage.
  const hasActiveOrPending = useMemo(
    () =>
      rows.some(
        (r) => r.status === "pending" || r.status === "pointing" || r.status === "verified",
      ),
    [rows],
  );

  return (
    <AppLayout
      crumbs={[{ label: "Custom domains" }]}
      title="Custom domains"
      description="Serve your dynamic QR links from your own domain, so a scan shows links.yourbrand.com/x/abc instead of ours."
    >
      <div>
        <Accordion
          type="single"
          collapsible
          defaultValue={hasActiveOrPending ? undefined : "add"}
          className="mt-6"
        >
          <AccordionItem
            value="add"
            className="rounded-2xl border border-border bg-card px-3.5 sm:px-5"
          >
            <AccordionTrigger className="text-sm font-medium hover:no-underline">
              <Label htmlFor="domain" className="cursor-pointer">
                Add a domain
              </Label>
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="domain"
                  value={domain}
                  placeholder="links.yourbrand.com"
                  onChange={(e) => setDomain(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void add();
                    }
                  }}
                />
                <Button onClick={add} disabled={adding || !domain.trim()} className="gap-2">
                  {adding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Globe className="h-4 w-4" />
                  )}
                  Add domain
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Use a subdomain you control. Root domains work too, but need an A record instead of
                a CNAME.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Collapsed by default so mobile users reach their domains without scrolling. */}
        <Accordion
          type="single"
          collapsible
          defaultValue={hasActiveOrPending ? undefined : "why"}
          className="mt-3"
        >
          <AccordionItem
            value="why"
            className="rounded-2xl border border-border bg-muted/30 px-3.5 sm:px-5"
          >
            <AccordionTrigger className="text-sm font-medium hover:no-underline">
              💡 Why a subdomain is the safest choice
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-xs text-muted-foreground">
                A subdomain such as{" "}
                <span className="font-mono text-foreground">links.yourbrand.com</span> or{" "}
                <span className="font-mono text-foreground">qr.yourbrand.com</span> only needs a
                single CNAME record. Your website, e-mail and existing records stay untouched. The
                root domain (<span className="font-mono text-foreground">yourbrand.com</span>) needs
                an A record and moves your whole site here — only do that if the domain is unused.
              </p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-3">
                {[
                  ["links.yourbrand.com", "Neutral, works for every campaign"],
                  ["qr.yourbrand.com", "Explicit about what the link is"],
                  ["go.yourbrand.com", "Short and readable on print"],
                ].map(([host, why]) => (
                  <li key={host} className="rounded-xl border border-border bg-background p-3">
                    <p className="break-all font-mono text-xs text-foreground">{host}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{why}</p>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <section className="mt-6 space-y-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
              <Globe className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium text-foreground">No domains connected yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Add a subdomain above and we'll walk you through the DNS records step by step.
              </p>
            </div>
          ) : (
            rows.map((row) => {
              const meta = STATUS[row.status] ?? STATUS.pending;
              const Icon = meta.icon;
              const liveResult = live[row.id];
              const subdomain = isSubdomain(row.domain);
              const leaf = row.domain.split(".")[0];

              const txtHost = provider === "standard" ? `_rout.${row.domain}` : "_rout";
              const cnameHost = provider === "standard" ? row.domain : leaf;

              return (
                <article key={row.id} className="border border-border rounded-xl p-4 bg-card">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <h2 className="min-w-0 break-all font-mono text-base text-foreground">
                      {row.domain}
                    </h2>
                    <Badge className={`gap-1 ${meta.tone}`}>
                      <Icon className="h-3 w-3" /> {meta.label}
                    </Badge>
                    {row.is_default && (
                      <Badge variant="outline" className="gap-1">
                        <Star className="h-3 w-3" /> Default
                      </Badge>
                    )}
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        disabled={checking === row.id}
                        onClick={() => verify(row)}
                      >
                        {checking === row.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Check DNS
                      </Button>
                      {row.status === "verified" && !row.is_default && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            await setDefaultDomain({ data: { id: row.id } });
                            toast.success(`${row.domain} is now the default`);
                            await load();
                          }}
                        >
                          Make default
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${row.domain}`}
                        onClick={async () => {
                          await deleteCustomDomain({ data: { id: row.id } });
                          toast.success(trI18n.t("ui.0123506e5a"));
                          await load();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {row.status === "verified" && (
                    <div className="mt-3 flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">Short links</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {row.short_links_enabled
                            ? `New links can use ${row.domain}/s/your-code.`
                            : `Off — new links use the ROUT domain instead.`}
                        </p>
                      </div>
                      <Switch
                        checked={row.short_links_enabled}
                        aria-label={`Short links on ${row.domain}`}
                        onCheckedChange={async (enabled) => {
                          await setDomainShortLinks({ data: { id: row.id, enabled } });
                          toast.success(
                            enabled
                              ? `Short links on for ${row.domain}`
                              : `Short links off for ${row.domain}`,
                          );
                          await load();
                        }}
                      />
                    </div>
                  )}

                  {liveResult ? (
                    <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${LIVE[liveResult.state].dot}`}
                        />
                        <p className="text-sm font-medium text-foreground">
                          {LIVE[liveResult.state].title}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {LIVE[liveResult.state].body}
                      </p>
                      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                        TXT {liveResult.txt ? "✓" : "✗"} · CNAME/A {liveResult.route ? "✓" : "✗"}
                      </p>
                    </div>
                  ) : null}

                  {row.status !== "verified" && (
                    <div className="mt-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`provider-${row.id}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          DNS provider
                        </Label>
                        <Select
                          value={provider}
                          onValueChange={(v) => setProvider(v as DnsProvider)}
                        >
                          <SelectTrigger id={`provider-${row.id}`} className="h-8 w-56 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard">Standard</SelectItem>
                            <SelectItem value="cloudflare">Cloudflare & Infomaniak</SelectItem>
                            <SelectItem value="transip">TransIP</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <ol className="space-y-5">
                        <Step n={1} title="Open your DNS Management Console">
                          <p>
                            Log in to your domain registrar, e.g. Infomaniak, Cloudflare, for{" "}
                            <span className="break-all font-mono text-foreground">
                              {row.domain}
                            </span>
                            , and look for “DNS”, “DNS records” or “Zone editor”.
                          </p>
                        </Step>
                        <Step n={2} title="Add Verification TXT Record">
                          <p>Proves ownership of this domain. Nothing else changes.</p>
                          <RecordCard type="TXT" host={txtHost} value={row.verification_token} />
                        </Step>
                        <Step n={3} title="Add Routing Record">
                          <p>Routes your QR traffic to ROUT.</p>
                          {subdomain ? (
                            <RecordCard
                              type="CNAME"
                              host={cnameHost}
                              value={DOMAIN_CNAME_TARGET}
                              note="TTL Auto or 3600 · proxy/CDN off"
                            />
                          ) : (
                            <RecordCard type="A" host={cnameHost || "@"} value={DOMAIN_A_TARGET} />
                          )}
                        </Step>
                        <Step n={4} title="Verify & Propagation">
                          <p>
                            Press “Check DNS” to validate. Records usually go live within minutes,
                            but propagation can take up to 24 hours — you can safely close this
                            page.
                          </p>
                        </Step>
                      </ol>
                    </div>
                  )}

                  {row.last_checked_at && (
                    <p className="mt-3 text-[11px] text-muted-foreground">
                      Last checked {new Date(row.last_checked_at).toLocaleString()}
                    </p>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </AppLayout>
  );
}
