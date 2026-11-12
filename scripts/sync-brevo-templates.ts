/**
 * Pushes the code-built ROUT mail design to Brevo (PUT /v3/smtp/templates/{id}).
 *
 *   bun scripts/sync-brevo-templates.ts            update every template
 *   bun scripts/sync-brevo-templates.ts --dry-run  list what would change
 *
 * Needs BREVO_API_KEY (xkeysib-…). Never sends a mail; only updates templates.
 */
import { buildSyncPlan } from "../src/emails/brevo-sync-plan";

const dry = process.argv.includes("--dry-run");
const key = (process.env["BREVO_API_KEY"] ?? "").trim();
if (!dry && !key.startsWith("xkeysib-")) {
  console.error("BREVO_API_KEY (xkeysib-…) missing — run with --dry-run to preview.");
  process.exit(1);
}

let ok = 0;
let failed = 0;
for (const item of buildSyncPlan()) {
  if (dry) {
    console.log(`#${item.id}\t${item.name}\t${item.mail.subject.slice(0, 60)}`);
    continue;
  }
  const res = await fetch(`https://api.brevo.com/v3/smtp/templates/${item.id}`, {
    method: "PUT",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ templateName: item.name, subject: item.mail.subject, htmlContent: item.mail.html, isActive: true }),
  });
  if (res.ok) {
    ok++;
    console.log(`✓ #${item.id} ${item.name}`);
  } else {
    failed++;
    console.error(`✗ #${item.id} ${item.name} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}
if (!dry) console.log(`\n${ok} updated, ${failed} failed`);
process.exit(failed ? 1 : 0);
