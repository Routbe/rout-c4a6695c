import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ConsoleCard, ConsolePage } from "@/components/console/ConsolePage";
import { AppLogo } from "@/components/console/AppLogo";
import { useAppPage } from "@/components/console/useAppPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/console/apps/$appId/branding")({
  head: () => ({ meta: [{"title": "Branding \u2014 ROUT Developer Console"}, {"name": "description", "content": "Manage branding for your ROUT application."}, {"property": "og:title", "content": "Branding \u2014 ROUT Developer Console"}, {"property": "og:description", "content": "Manage branding for your ROUT application."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary_large_image"}] }),
  component: BrandingPage,
});

function BrandingPage() {
  const { appId } = Route.useParams();
  const { app, persist, saving } = useAppPage(appId);
  const [f, setF] = useState({
    name: app.name,
    logoUrl: app.logoUrl ?? "",
    homepageUrl: app.homepageUrl ?? "",
    privacyUrl: app.privacyUrl ?? "",
    termsUrl: app.termsUrl ?? "",
  });
  const field = (key: keyof typeof f, label: string, type = "url") => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input id={key} type={type} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
    </div>
  );
  const orNull = (v: string) => (v.trim() ? v.trim() : null);

  return (
    <ConsolePage title="Branding" description="Wat gebruikers zien op het toestemmingsscherm.">
      <ConsoleCard>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            persist({
              name: f.name.trim(),
              logoUrl: orNull(f.logoUrl),
              homepageUrl: orNull(f.homepageUrl),
              privacyUrl: orNull(f.privacyUrl),
              termsUrl: orNull(f.termsUrl),
            });
          }}
        >
          {field("name", "Naam", "text")}
          {field("logoUrl", "Logo-URL")}
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <AppLogo app={{ name: f.name || "?", logoUrl: orNull(f.logoUrl) }} />
            <span className="text-sm text-muted-foreground">Voorbeeld</span>
          </div>
          {field("homepageUrl", "Website")}
          {field("privacyUrl", "Privacybeleid")}
          {field("termsUrl", "Gebruiksvoorwaarden")}
          <Button type="submit" disabled={saving}>{saving ? "Opslaan…" : "Opslaan"}</Button>
        </form>
      </ConsoleCard>
    </ConsolePage>
  );
}
