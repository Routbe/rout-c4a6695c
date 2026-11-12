import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Award, FileBadge, GraduationCap, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "@/lib/router-compat";
import { getPublicAppCredentials } from "@/lib/app-credentials.functions";
import { groupAppCredentials, type AppCredential } from "@/lib/app-credentials";
const icons = { badge: Award, certificate: FileBadge, diploma: GraduationCap };
export function ConnectedApps({ handle, compact = false }: { handle: string; compact?: boolean }) {
  const load = useServerFn(getPublicAppCredentials);
  const [items, setItems] = useState<AppCredential[]>([]);
  const [selected, setSelected] = useState<AppCredential | null>(null);
  useEffect(() => { let alive = true; setItems([]); void load({ data: { handle } }).then(result => { if (alive) setItems(result); }).catch(() => undefined); return () => { alive = false; }; }, [handle, load]);
  const visible = compact ? items.filter(c => c.type === "badge" && c.showOnName) : items;
  if (!visible.length) return null;
  return <>
    {compact ? <span className="inline-flex gap-1">{visible.map(c => <Button key={c.id} variant="ghost" size="icon" title={c.title} aria-label={`Bekijk ${c.title}`} onClick={() => setSelected(c)}><Award /></Button>)}</span> : <section aria-label="Credentials van gekoppelde apps" className="my-6 border-y border-border py-6"><h2 className="mb-5 text-lg font-semibold text-foreground">Gekoppelde apps</h2>{groupAppCredentials(visible).map(g => <div key={g.clientId} className="mb-6"><h3 className="mb-3 text-sm font-medium text-muted-foreground">{g.name}</h3><div className="grid gap-3 sm:grid-cols-2">{g.credentials.map(c => { const Icon = icons[c.type]; return <Button key={c.id} variant="soft" className="h-auto min-h-20 justify-start whitespace-normal p-4 text-left" onClick={() => setSelected(c)}><Icon /><span className="min-w-0 break-words">{c.title}<span className="mt-1 block text-xs font-normal text-muted-foreground">{c.type}</span></span></Button>; })}</div></div>)}</section>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent><DialogHeader><DialogTitle>{selected?.title}</DialogTitle><DialogDescription>{selected?.issuerHandle ? `Uitgereikt door @${selected.issuerHandle}` : `Uitgereikt door ${selected?.appName ?? "de app"}`}</DialogDescription></DialogHeader>{selected?.description && <p className="text-sm leading-7">{selected.description}</p>}{selected?.issuerHandle && <Link to={`/${selected.issuerHandle}`} className="text-sm text-primary underline">Bekijk de uitgever</Link>}<Button asChild variant="matcha"><Link to="/about/custom-badges">Meer info <ArrowUpRight /></Link></Button></DialogContent></Dialog>
  </>;
}