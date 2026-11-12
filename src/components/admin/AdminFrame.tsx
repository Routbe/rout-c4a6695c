import { Link } from "@tanstack/react-router";
import { ExternalLink, LogOut, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { RoutLogo } from "@/components/RoutLogo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { AdminPortalNav } from "./AdminPortalNav";
import type { PortalFrameProps } from "@/components/layout/PortalContext";
import { cn } from "@/lib/utils";

export function AdminFrame({ children, heading, width }: PortalFrameProps) {
  const { user, signOut } = useAuth();
  return (
    <div className="flex min-h-screen flex-col bg-background" data-shell="admin" data-hardware-ui>
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/admin" aria-label="ROUT beheer"><RoutLogo size={28} /></Link>
          <span className="flex items-center gap-2 text-sm font-medium"><Shield className="size-4 text-primary" aria-hidden /> Beheerportaal</span>
          <div className="ml-auto flex items-center gap-2">
            <LanguageToggle /><ThemeToggle />
            <Button asChild variant="ghost" size="icon"><a href="https://rout.be" target="_blank" rel="noopener noreferrer" aria-label="Open publieke website" title="Open publieke website"><ExternalLink /></a></Button>
            {user && <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="Uitloggen" title="Uitloggen"><LogOut /></Button>}
          </div>
        </div>
      </header>
      <div className="flex flex-1 flex-col lg:flex-row">
        {user && <aside className="border-b border-border p-4 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r"><AdminPortalNav /></aside>}
        <main className={cn("mx-auto min-w-0 flex-1", width === "full" ? "w-full" : "w-full px-4 py-8 sm:px-6", width === "wide" ? "max-w-7xl" : width === "default" ? "max-w-5xl" : "")}>
          {heading}{children}
        </main>
      </div>
    </div>
  );
}