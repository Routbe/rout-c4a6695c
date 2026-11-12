import { createContext, useContext } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  AtSign, Award, BadgeCheck, Building2, CreditCard, Gift, Globe, Inbox, KeyRound, LayoutDashboard, Landmark, Lock, Mail, Plug, Power,
  Rocket, ScrollText, Shield, Sparkles, Tag, UserCog, UserSearch, Users, Webhook, Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminConsoleTab } from "@/components/imported-pages/Admin";

/** True inside the /admin layout so AppLayout renders the portal sidebar. */
export const AdminPortalContext = createContext(false);
export const useInAdminPortal = () => useContext(AdminPortalContext);

type AdminPath =
  | "/admin" | "/admin/verifications" | "/admin/console" | "/admin/sepa" | "/admin/ops" | "/admin/oauth-apps"
  | "/admin/members" | "/admin/handles" | "/admin/brands" | "/admin/subdomains" | "/admin/workspaces"
  | "/admin/features" | "/admin/integrations" | "/admin/webhooks" | "/admin/custom-badges" | "/admin/finance"
  | "/admin/gift-cards" | "/admin/contact" | "/admin/infra" | "/admin/team" | "/admin/recovery";
type NavItem = { to: AdminPath; label: string; icon: typeof Shield; tab?: AdminConsoleTab };

/**
 * Single map of the admin portal. Every admin screen must be reachable from
 * here (see admin-portal-nav.test.ts): requests first, then people and names,
 * workspaces, switches, money, communication and system.
 */
export const ADMIN_NAV_GROUPS: ReadonlyArray<{ label: string; items: ReadonlyArray<NavItem> }> = [
  { label: "Overzicht", items: [{ to: "/admin", label: "Mission control", icon: LayoutDashboard }] },
  {
    label: "Aanvragen & verificatie",
    items: [
      { to: "/admin/verifications", label: "Bedrijf & influencer", icon: BadgeCheck },
      { to: "/admin/console", tab: "verifications", label: "Betaalde verificaties", icon: CreditCard },
      { to: "/admin/sepa", label: "SEPA review", icon: Landmark },
      { to: "/admin/ops", label: "Telefoon, badges & links", icon: Wrench },
      { to: "/admin/oauth-apps", label: "OAuth-apps", icon: KeyRound },
      { to: "/admin/recovery", label: "Passkey-herstel", icon: Shield },
    ],
  },
  {
    label: "Leden & namen",
    items: [
      { to: "/admin/members", label: "Leden 360°", icon: UserSearch },
      { to: "/admin/console", tab: "users", label: "Moderatie & bulk", icon: UserCog },
      { to: "/admin/console", tab: "members", label: "Lidstatus", icon: Users },
      { to: "/admin/handles", label: "Gebruikersnamen", icon: AtSign },
      { to: "/admin/brands", label: "Merknamen", icon: Lock },
      { to: "/admin/console", tab: "vip", label: "VIP-handles", icon: Sparkles },
      { to: "/admin/console", tab: "network", label: "Aliassen & netwerk", icon: Mail },
      { to: "/admin/subdomains", label: "Subdomeinen", icon: Globe },
    ],
  },
  { label: "Werkruimtes", items: [{ to: "/admin/workspaces", label: "Werkruimtes & bedrijven", icon: Building2 }] },
  {
    label: "Functies & koppelingen",
    items: [
      { to: "/admin/features", label: "Functies aan/uit", icon: Power },
      { to: "/admin/integrations", label: "Schakelkast", icon: Plug },
      { to: "/admin/webhooks", label: "Webhooks", icon: Webhook },
    ],
  },
  { label: "Heraldiek", items: [{ to: "/admin/custom-badges", label: "Wapenschilden & badges", icon: Award }] },
  {
    label: "Financieel",
    items: [
      { to: "/admin/finance", label: "Financieel overzicht", icon: Landmark },
      { to: "/admin/console", tab: "transactions", label: "Transacties & audit", icon: ScrollText },
      { to: "/admin/console", tab: "inbound", label: "Inkomende betalingen", icon: Landmark },
      { to: "/admin/console", tab: "pricing", label: "Prijzen", icon: Tag },
      { to: "/admin/console", tab: "promos", label: "Promocodes", icon: Tag },
      { to: "/admin/gift-cards", label: "Cadeaubonnen", icon: Gift },
    ],
  },
  {
    label: "Communicatie",
    items: [
      { to: "/admin/contact", label: "Contact-inbox", icon: Inbox },
      { to: "/admin/console", tab: "delivery", label: "E-mail & levering", icon: Mail },
      { to: "/admin/console", tab: "showcase", label: "Showcase", icon: Sparkles },
    ],
  },
  {
    label: "Systeem",
    items: [
      { to: "/admin/infra", label: "Infrastructuur & logs", icon: Webhook },
      { to: "/admin/console", tab: "deployment", label: "Deployment", icon: Rocket },
      { to: "/admin/team", label: "Mede-admins & rechten", icon: Shield },
    ],
  },
];

const linkClass = (active: boolean) =>
  cn(
    "flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
    active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
  );

export function AdminPortalNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const tab = useRouterState({ select: (s) => (s.location.search as { tab?: string }).tab });
  return (
    <nav aria-label="Beheerportaal" className="space-y-5 text-sm">
      <div className="flex items-center gap-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Shield className="h-3.5 w-3.5" aria-hidden /> ROUT Ops Center
      </div>
      {ADMIN_NAV_GROUPS.map((g) => (
        <div key={g.label}>
          <p className="mb-1 px-2 text-[11px] uppercase tracking-wide text-muted-foreground">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = it.to === "/admin"
                ? path === "/admin" || path === "/admin/"
                : it.tab
                  ? path.startsWith(it.to) && (tab ?? "users") === it.tab
                  : path.startsWith(it.to);
              const Icon = it.icon;
              return (
                <li key={`${it.to}:${it.tab ?? ""}`}>
                  {it.tab ? (
                    <Link to="/admin/console" search={{ tab: it.tab }} className={linkClass(active)}>
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      {it.label}
                    </Link>
                  ) : (
                    <Link to={it.to} className={linkClass(active)}>
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      {it.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
