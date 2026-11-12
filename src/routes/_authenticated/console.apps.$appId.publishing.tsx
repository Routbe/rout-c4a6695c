import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, FlaskConical, Globe, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ConsoleCard, ConsolePage } from "@/components/console/ConsolePage";
import { errorText } from "@/components/console/console-data";
import { useAppPage } from "@/components/console/useAppPage";
import {
  addOAuthTestUser,
  getOAuthClientInsights,
  listOAuthTestUsers,
  removeOAuthTestUser,
  requestOAuthVerification,
} from "@/lib/oauth/console.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { i18n as trI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/console/apps/$appId/publishing")({
  head: () => ({ meta: [{"title": "Publishing \u2014 ROUT Developer Console"}, {"name": "description", "content": "Manage publishing for your ROUT application."}, {"property": "og:title", "content": "Publishing \u2014 ROUT Developer Console"}, {"property": "og:description", "content": "Manage publishing for your ROUT application."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary_large_image"}] }),
  component: PublishingPage,
});

const MODES = [
  { id: "testing", icon: FlaskConical, title: "Testing", text: "Only you and up to 10 test users can sign in." },
  { id: "production", icon: Globe, title: "In production", text: "Every ROUT member can sign in to your app." },
] as const;

function PublishingPage() {
  const { appId } = Route.useParams();
  const { app, persistSettings, saving } = useAppPage(appId);
  const qc = useQueryClient();
  const listUsers = useServerFn(listOAuthTestUsers);
  const addUser = useServerFn(addOAuthTestUser);
  const removeUser = useServerFn(removeOAuthTestUser);
  const insights = useServerFn(getOAuthClientInsights);
  const requestBadge = useServerFn(requestOAuthVerification);

  const users = useQuery({ queryKey: ["console", "test-users", appId], queryFn: () => listUsers({ data: { id: appId } }) });
  const status = useQuery({ queryKey: ["console", "insights", appId], queryFn: () => insights({ data: { id: appId } }) });
  const [identifier, setIdentifier] = useState("");
  const [contact, setContact] = useState({
    supportEmail: app.supportEmail ?? "",
    legalOwner: app.legalOwner ?? "",
    dpoEmail: app.dpoEmail ?? "",
  });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const verification = status.data?.verification.status ?? "none";

  return (
    <ConsolePage title="Publishing & Verification" description="Control who can sign in and request the official ROUT Verified badge.">
      <ConsoleCard title="Environment">
        <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
          {MODES.map(({ id, icon: Icon, title, text }) => {
            const active = app.publishingStatus === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={saving}
                onClick={() => !active && persistSettings({ publishingStatus: id })}
                className={`rounded-xl border p-5 text-left transition-colors ${active ? "border-foreground bg-muted" : "border-border hover:border-foreground/40"}`}
              >
                <Icon className="mb-3 h-5 w-5" />
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{text}</p>
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Production requires a support email and a legal owner below.</p>
      </ConsoleCard>

      {app.publishingStatus === "testing" && (
        <ConsoleCard title="Test users" description="Email addresses or ROUT handles allowed to sign in while testing (max 10).">
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await addUser({ data: { id: appId, identifier } });
                setIdentifier("");
                await qc.invalidateQueries({ queryKey: ["console", "test-users", appId] });
              } catch (err) {
                toast.error(errorText(err, "Could not add test user."));
              }
            }}
          >
            <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="name@example.com or @handle" maxLength={200} />
            <Button type="submit" disabled={!identifier.trim() || (users.data?.length ?? 0) >= 10}>
              <UserPlus className="h-4 w-4" /> Add
            </Button>
          </form>
          <ul className="mt-4 divide-y divide-border">
            {(users.data ?? []).map((u) => (
              <li key={u} className="flex items-center justify-between py-2 text-sm">
                <span className="font-mono text-xs">{u}</span>
                <button
                  type="button"
                  aria-label={`Remove ${u}`}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  onClick={async () => {
                    await removeUser({ data: { id: appId, identifier: u } });
                    await qc.invalidateQueries({ queryKey: ["console", "test-users", appId] });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
            {users.data?.length === 0 && <li className="py-2 text-xs text-muted-foreground">No test users yet. You (the owner) can always sign in.</li>}
          </ul>
        </ConsoleCard>
      )}

      <ConsoleCard title="Developer contact & legal">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            persistSettings({
              supportEmail: contact.supportEmail.trim() || null,
              legalOwner: contact.legalOwner.trim() || null,
              dpoEmail: contact.dpoEmail.trim() || null,
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="supportEmail">Support email *</Label>
            <Input id="supportEmail" type="email" maxLength={200} value={contact.supportEmail} onChange={(e) => setContact({ ...contact, supportEmail: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="legalOwner">Legal entity / app owner *</Label>
            <Input id="legalOwner" maxLength={160} value={contact.legalOwner} onChange={(e) => setContact({ ...contact, legalOwner: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dpoEmail">Data Protection Officer (optional)</Label>
            <Input id="dpoEmail" type="email" maxLength={200} value={contact.dpoEmail} onChange={(e) => setContact({ ...contact, dpoEmail: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save contact details"}</Button>
          </div>
        </form>
      </ConsoleCard>

      <ConsoleCard title="Verification center">
        <div className="flex flex-wrap items-start gap-4">
          <BadgeCheck className={`h-8 w-8 ${verification === "verified" ? "text-primary" : "text-muted-foreground"}`} />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Official ROUT Verified App</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {verification === "verified" && "Your app carries the verified badge on the consent screen."}
              {verification === "pending" && "Your request is under review by the ROUT team."}
              {verification === "rejected" && "Your last request was not approved. Update your details and try again."}
              {verification === "none" && "Verified apps show a badge on the consent screen. Requires support email, legal owner and a privacy policy."}
            </p>
            {(verification === "none" || verification === "rejected") && (
              <div className="mt-4 space-y-3">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Tell us about your app and how it uses ROUT identity (optional)." />
                <Button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await requestBadge({ data: { id: appId, note: note.trim() || undefined } });
                      toast.success(trI18n.t("ui.13245ee91c"));
                      await qc.invalidateQueries({ queryKey: ["console", "insights", appId] });
                    } catch (err) {
                      toast.error(errorText(err, "Request failed."));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <BadgeCheck className="h-4 w-4" /> Request ROUT Verified badge
                </Button>
              </div>
            )}
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs capitalize text-muted-foreground">{verification === "none" ? "not requested" : verification}</span>
        </div>
      </ConsoleCard>
    </ConsolePage>
  );
}
