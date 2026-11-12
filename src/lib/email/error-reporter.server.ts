import { AUTO_REPORT_RULE } from "@/lib/save-errors";

export interface ErrorReport {
  errorName: string;
  code: string;
  status: number;
  stack?: string | null;
  userId?: string | null;
  workspaceId?: string | null;
  endpoint: string;
  method: string;
  userAgent?: string | null;
  at: string;
  /** "user" = clicked "Foutrapport sturen"; "auto" = critical server failure. */
  trigger: "user" | "auto";
}

export interface ReporterDeps {
  send: (mail: { to: string; subject: string; html: string; tags: string[] }) => Promise<{ sent: boolean; error?: string }>;
  /** Shared limiter; returns ok=false when this error type was already mailed in the window. */
  limit: (bucket: string) => Promise<{ ok: boolean }>;
  recipient: () => string;
}

function esc(value: string): string {
  return value.replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"));
}

export function renderErrorReport(r: ErrorReport): { subject: string; html: string } {
  const rows: [string, string][] = [
    ["Fout", `${r.errorName} (${r.code})`],
    ["HTTP-status", String(r.status)],
    ["Tijd", r.at],
    ["Gebruiker", r.userId ?? "-"],
    ["Workspace", r.workspaceId ?? "persoonlijk"],
    ["Endpoint", `${r.method} ${r.endpoint}`],
    ["User-Agent", r.userAgent ?? "-"],
    ["Bron", r.trigger === "user" ? "Gebruiker stuurde rapport" : "Automatisch (kritieke fout)"],
  ];
  const table = rows.map(([k, v]) => `<tr><td><strong>${esc(k)}</strong></td><td>${esc(v)}</td></tr>`).join("");
  const stack = r.stack ? `<pre style="white-space:pre-wrap">${esc(r.stack.slice(0, 4000))}</pre>` : "";
  return { subject: `[ROUT] Opslagfout: ${r.code} (${r.status})`, html: `<table>${table}</table>${stack}` };
}

/** Sends one admin report. Automatic reports are limited per error type. */
export async function reportError(r: ErrorReport, deps?: ReporterDeps): Promise<{ sent: boolean; reason?: string }> {
  const d = deps ?? (await defaultDeps());
  if (r.trigger === "auto") {
    const gate = await d.limit(`auto:${r.code}:${r.errorName}`);
    if (!gate.ok) return { sent: false, reason: "rate_limited" };
  }
  const { subject, html } = renderErrorReport(r);
  try {
    const res = await d.send({ to: d.recipient(), subject, html, tags: ["error-report", r.trigger] });
    return res.sent ? { sent: true } : { sent: false, reason: res.error ?? "send_failed" };
  } catch (error) {
    console.error("[error-reporter] send failed:", (error as Error)?.message);
    return { sent: false, reason: "send_failed" };
  }
}

async function defaultDeps(): Promise<ReporterDeps> {
  const { sendMail } = await import("@/emails/send.server");
  const { hitRateLimit } = await import("@/lib/rate-limit-db.server");
  const { contactRecipient } = await import("@/lib/contact.server");
  return {
    send: (m) => sendMail({ ...m, category: "system", language: "nl" }),
    limit: (bucket) => hitRateLimit("error-report", bucket, AUTO_REPORT_RULE),
    recipient: () => process.env["ERROR_REPORT_EMAIL"] ?? process.env["ADMIN_EMAIL"] ?? contactRecipient(),
  };
}
