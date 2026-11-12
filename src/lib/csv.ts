/**
 * Minimal RFC-4180 CSV builder + browser download helper.
 *
 * Every value passes through `sanitizeCsvField` first: spreadsheets treat a
 * leading `=`, `+`, `-`, `@`, tab or carriage return as the start of a formula,
 * so user-generated text (handles, names, bios, notes) could otherwise execute
 * code in Excel / Numbers / Sheets. We neutralise those cells with a leading
 * single quote, then apply normal RFC-4180 quoting.
 */

const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

/** Neutralises spreadsheet formula injection in a single cell value. */
export function sanitizeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  // Strip control characters that break parsers, keep tab/newline handling to the quoter.
  // eslint-disable-next-line no-control-regex -- intentionally strips control chars
  const raw = String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  return FORMULA_TRIGGERS.test(raw) ? `'${raw}` : raw;
}

/** RFC-4180 quoting: wrap on comma/quote/newline and double any inner quote. */
export function quoteCsvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function escapeCsvField(value: unknown): string {
  return quoteCsvField(sanitizeCsvField(value));
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return [
    columns.map((c) => escapeCsvField(c)).join(","),
    ...rows.map((row) => columns.map((c) => escapeCsvField(row[c])).join(",")),
  ].join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
