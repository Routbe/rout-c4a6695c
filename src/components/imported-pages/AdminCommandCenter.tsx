import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { CommandBoard, type BoardWidget } from "@/components/admin/CommandBoard";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowUpRight, Award, BadgeCheck, CheckCircle2, Gift, Globe, Inbox, KeyRound, Landmark, Plug, UserSearch, Users, Webhook, Wrench,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ControlHeader, ControlMetric, ControlTable, ControlError } from "@/components/admin/ControlCenterUI";
import { commandQuery } from "@/lib/admin-control.queries";
import { webhookHealth } from "@/lib/admin-control-rules";

const MODULES = [
  { to: "/admin/members", label: "Leden 360°", desc: "Zoeken, status, sessies, identiteiten", icon: UserSearch },
  { to: "/admin/verifications", label: "Verificaties", desc: "Aanvragen beoordelen en vinkjes toekennen", icon: BadgeCheck },
  { to: "/admin/team", label: "Team & rechten", desc: "Mede-admins en bevoegdheden", icon: Users },
  { to: "/admin/custom-badges", label: "Badges", desc: "Wapenschilden en claimlinks", icon: Award },
  { to: "/admin/integrations", label: "Schakelkast", desc: "Platformkoppelingen aan/uit", icon: Plug },
  { to: "/admin/oauth-apps", label: "OAuth-apps", desc: "Ontwikkelaarsapps goedkeuren", icon: KeyRound },
  { to: "/admin/finance", label: "Financieel", desc: "Donaties, IBAN-controle, SEPA", icon: Landmark },
  { to: "/admin/gift-cards", label: "Cadeaubonnen", desc: "Uitgifte en inwisseling", icon: Gift },
  { to: "/admin/subdomains", label: "Subdomeinen", desc: "Claims en tiers", icon: Globe },
  { to: "/admin/infra", label: "Infrastructuur", desc: "Logs en systeemgezondheid", icon: Webhook },
  { to: "/admin/ops", label: "Operations", desc: "Onderhoudstaken en sync", icon: Wrench },
  { to: "/admin/contact", label: "Contact-inbox", desc: "Berichten van bezoekers", icon: Inbox },
] as const;

export default function AdminCommandCenter() {
  const { data, refetch, isFetching, isRefetchError } = useSuspenseQuery(commandQuery);
  const actions = [
    { label: "Verificatie-aanvragen", count: data.verificationRequests, to: "/admin/verifications" },
    { label: "SEPA reviews", count: data.sepaReviews, to: "/admin/finance" },
    { label: "Mislukte webhooks", count: data.failedWebhooks, to: "/admin/infra" },
  ] as const;
  const open = actions.reduce((n, a) => n + a.count, 0);
  const widgets: BoardWidget[] = [
    { id: "members", title: "Actieve leden", render: () => <ControlMetric label="Actieve leden" value={data.activeMembers} detail={`${data.totalMembers} profielen totaal`} /> },
    { id: "visitors", title: "Profielbezoekers", render: () => <ControlMetric label="Profielbezoeken (24 u)" value={data.visitsDay} detail={`${data.visitsWeek} deze week · ${data.visitsMonth} in 30 dagen`} /> },
    { id: "new-members", title: "Nieuwe leden", render: () => <ControlMetric label="Nieuwe leden (7 d)" value={data.newMembersWeek} /> },
    { id: "badges", title: "Uitgedeelde badges", render: () => <ControlMetric label="Uitgedeelde badges" value={data.standardBadges + data.customBadges} detail={`${data.customBadges} wapenschilden · ${data.standardBadges} platformbadges`} /> },
    { id: "verifications", title: "Open verificaties", render: () => <ControlMetric label="Open verificaties" value={data.verificationRequests} /> },
    { id: "webhooks", title: "Mislukte webhooks", render: () => <ControlMetric label="Mislukte webhooks" value={data.failedWebhooks} /> },
    { id: "actions", title: "Actie vereist", render: () => <Section title={<>{open ? <AlertTriangle className="h-5 w-5 text-warning" /> : <CheckCircle2 className="h-5 w-5 text-accent" />} Actie vereist</>}>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
        {actions.map((a) => <li key={a.to}><Link to={a.to} className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-secondary/50">
          <span className="flex items-center gap-3">{a.count ? <AlertTriangle className="h-4 w-4 text-warning" /> : <CheckCircle2 className="h-4 w-4 text-accent" />}{a.label}</span>
          <span className="flex items-center gap-3"><b className="tabular-nums">{a.count}</b><ArrowUpRight className="h-4 w-4" /></span>
        </Link></li>)}
      </ul></Section> },
    { id: "modules", title: "Beheermodules", render: () => <Section title="Beheermodules">
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
        {MODULES.map((m) => { const Icon = m.icon; return <Link key={m.to} to={m.to} className="group rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground/40">
          <Icon className="h-5 w-5 text-primary" aria-hidden /><p className="mt-2 font-medium">{m.label}</p><p className="text-xs text-muted-foreground">{m.desc}</p></Link>; })}
      </div></Section> },
    { id: "events", title: "Recente systeemevents", render: () => <Section title="Recente systeemevents" extra={<Link to="/admin/infra" className="text-sm underline">Logboek</Link>}>
      <ControlTable headers={["Bron", "Event", "Status", "Ontvangen"]} empty={!data.events.length}>
        {data.events.map((e) => <tr key={e.id}>
          <td className="px-3 py-3">{e.source}</td><td className="px-3 py-3">{e.kind ?? "—"}</td>
          <td className={`px-3 py-3 ${webhookHealth(e.status) === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{e.status}</td>
          <td className="whitespace-nowrap px-3 py-3 text-xs">{new Date(e.createdAt).toLocaleString("nl-BE")}</td></tr>)}
      </ControlTable></Section> },
  ];
  return (
    <AppLayout width="wide">
      <ControlHeader title="Mission Control" subtitle="Leden, identiteit en operationele aandachtspunten." refreshing={isFetching} refresh={() => void refetch()} />
      <ControlError error={isRefetchError} />
      <CommandBoard widgets={widgets} />
      <p className="mt-4 text-xs text-muted-foreground">Bijgewerkt {new Date(data.updatedAt).toLocaleString("nl-BE")}</p>
    </AppLayout>
  );
}

function Section({ title, extra, children }: { title: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return <section className="h-full"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold">{title}</h2>{extra}</div>{children}</section>;
}
