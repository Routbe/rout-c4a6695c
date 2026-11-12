import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { sendTestEmail, SAMPLE_DATA, type TestTemplate } from "@/lib/email-test.functions";
import { notifyError, notifySuccess } from "@/lib/notify";

/**
 * Lichte preview-flow voor de auth-mails.
 * De HTML-bestanden worden at build time ingelezen, de Go-template
 * placeholders ({{ .ConfirmationURL }} etc.) vervangen we door sample data.
 *
 * Daarnaast kan een ingelogde admin een echte test-mail versturen via Brevo,
 * zodat de templates in een echte mailclient gecheckt kunnen worden. Dat
 * endpoint is admin-only en rate-limited server-side.
 */
const rawTemplates = import.meta.glob("../emails/templates/*.html", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const LABELS: Record<string, string> = {
  "confirmation.html": "Signup — bevestiging",
  "magic-link.html": "Magic link",
  "recovery.html": "Wachtwoord herstel",
  "invite.html": "Uitnodiging",
  "email-change.html": "E-mailwijziging",
  "reauthentication.html": "Herauthenticatie",
};

/** Templates die via generateLink een echte mail kunnen versturen. */
const SENDABLE = new Set(["confirmation", "magic-link", "recovery", "invite", "email-change"]);

const FILES = Object.keys(rawTemplates)
  .map((path) => ({ path, file: path.split("/").pop()! }))
  .sort((a, b) => a.file.localeCompare(b.file));

function sampleFor(templateKey: string): Record<string, string> {
  return SAMPLE_DATA[templateKey as TestTemplate] ?? {};
}

function render(html: string, sample: Record<string, string>) {
  return html.replace(/\{\{\s*\.(\w+)\s*\}\}/g, (match, key: string) =>
    key in sample ? sample[key]! : match,
  );
}

function EmailPreview() {
  const [active, setActive] = useState(FILES[0]?.file ?? "");
  const [width, setWidth] = useState(390);
  const templateKeyForActive = active.replace(".html", "");
  const [sample, setSample] = useState<Record<string, string>>(() => ({
    ...sampleFor(templateKeyForActive),
  }));
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);

  const sendFn = useServerFn(sendTestEmail);

  const entry = FILES.find((f) => f.file === active) ?? FILES[0];
  const html = useMemo(
    () => (entry ? render(rawTemplates[entry.path] ?? "", sample) : ""),
    [entry, sample],
  );

  if (!entry) return <p className="p-8">Geen templates gevonden.</p>;

  const templateKey = active.replace(".html", "");
  const canSend = SENDABLE.has(templateKey);

  function selectTemplate(file: string) {
    setActive(file);
    setSample({ ...sampleFor(file.replace(".html", "")) });
  }

  async function handleSendTest() {
    if (!testEmail.trim()) return;
    setSending(true);
    try {
      const res = await sendFn({
        data: { template: templateKey as never, email: testEmail.trim() },
      });
      if (res.success) {
        notifySuccess("Test-mail verzonden", { description: `Naar ${res.recipient}` });
      } else if ("rateLimited" in res && res.rateLimited) {
        notifyError("Even geduld", {
          description: `Je hebt de limiet voor test-mails bereikt. Probeer het over ${res.retryAfterSeconds}s opnieuw.`,
        });
      } else {
        notifyError("Versturen mislukt", { description: res.error ?? "Onbekende fout" });
      }
    } catch (err) {
      notifyError("Versturen mislukt", {
        description: err instanceof Error ? err.message : "Fout bij verzenden",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-6xl space-y-6">
        <header className="space-y-1">
          <h1 className="font-display text-2xl text-foreground">E-mail preview</h1>
          <p className="text-sm text-muted-foreground">
            Alle auth-templates met sample data — geen testaccount nodig. Test-mails versturen is
            admin-only en rate-limited.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-4">
            <nav className="flex flex-col gap-1">
              {FILES.map(({ file }) => (
                <button
                  key={file}
                  type="button"
                  onClick={() => selectTemplate(file)}
                  className={`rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                    file === active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {LABELS[file] ?? file}
                </button>
              ))}
            </nav>

            {/* Test email sending */}
            <div className="space-y-3 rounded-2xl border border-border p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Test-mail versturen
              </p>
              {canSend ? (
                <>
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="jij@voorbeeld.be"
                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                  />
                  <button
                    type="button"
                    disabled={sending || !testEmail.trim()}
                    onClick={handleSendTest}
                    className="w-full rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {sending ? "Versturen…" : "Verstuur test-mail"}
                  </button>
                  <p className="text-[11px] text-muted-foreground">
                    Max. 5 test-mails per 10 minuten, alleen voor admins.
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Dit template kan niet via de API verzonden worden (geen `generateLink`-type
                  beschikbaar voor herauthenticatie — enkel te bekijken in de preview hiernaast).
                </p>
              )}
            </div>

            <div className="space-y-2 rounded-2xl border border-border p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Sample data ({LABELS[active] ?? active})
              </p>
              {Object.keys(sample).map((key) => (
                <label key={key} className="block space-y-1">
                  <span className="text-[11px] text-muted-foreground">{key}</span>
                  <input
                    value={sample[key] ?? ""}
                    onChange={(e) => setSample((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
                  />
                </label>
              ))}
            </div>

            <div className="flex gap-2">
              {[390, 600, 900].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWidth(w)}
                  className={`rounded-lg border border-border px-3 py-1 text-xs ${
                    w === width ? "bg-muted text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {w}px
                </button>
              ))}
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(rawTemplates[entry.path] ?? "")}
                className="rounded-lg border border-border px-3 py-1 text-xs text-muted-foreground"
              >
                Kopieer HTML
              </button>
            </div>
          </aside>

          <div className="overflow-auto rounded-2xl border border-border bg-muted/30 p-4">
            <iframe
              title={`Preview ${entry.file}`}
              srcDoc={html}
              style={{ width, height: 900, border: 0, background: "#fff" }}
              className="mx-auto rounded-xl shadow-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const title = "Auth-mail preview | ROUT";
const description = "Preview van alle authenticatie-e-mails in ROUT-huisstijl met sample data.";

export const Route = createFileRoute("/dev/emails")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EmailPreview,
});
