/** Builds the contact link that pre-fills a bug report with the error details. */
export const PROBLEM_REPORT_MAX = 1500;

export function problemReportText(error: { name?: string; message?: string; stack?: string } | null | undefined, page: string, when = new Date()): string {
  const lines = [
    `Pagina: ${page}`,
    `Tijd: ${when.toISOString()}`,
    `Fout: ${error?.name ?? "Error"}: ${error?.message || "Onbekende fout"}`,
    error?.stack ? `\n${error.stack}` : "",
  ];
  const text = lines.join("\n").trim();
  return text.length > PROBLEM_REPORT_MAX ? `${text.slice(0, PROBLEM_REPORT_MAX - 1)}…` : text;
}

export function problemReportHref(error: Parameters<typeof problemReportText>[0], page: string, when?: Date): string {
  return `/contact?topic=bug&report=${encodeURIComponent(problemReportText(error, page, when))}`;
}

export function readProblemReport(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.get("topic") !== "bug") return null;
  const report = params.get("report");
  return report ? report.slice(0, PROBLEM_REPORT_MAX) : "";
}
