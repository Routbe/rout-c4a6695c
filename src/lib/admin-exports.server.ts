/**
 * Chunked ("background") CSV export for inbound bank references.
 *
 * The admin portal can hold tens of thousands of inbound e-mails. Building
 * that file in a single request blocks the worker and times out, so the export
 * is produced page by page: the UI keeps requesting the next chunk while the
 * rest of the portal stays usable, then assembles the download link locally.
 */
import type { InboundPaymentRow } from "./admin-moderation.server";

export type InboundExportFilters = {
  matched?: boolean;
  status?: "paid" | "pending" | "failed";
};

export const EXPORT_CHUNK_SIZE = 100;

function matchesFilters(row: InboundPaymentRow, filters: InboundExportFilters) {
  if (typeof filters.matched === "boolean" && row.matched !== filters.matched) return false;
  if (filters.status && row.status !== filters.status) return false;
  return true;
}

/**
 * One page of export-shaped CSV rows. `done` flips on the final chunk so the
 * caller knows when to build the download link.
 */
export async function buildInboundExportChunk(opts: {
  page: number;
  perPage?: number;
  filters?: InboundExportFilters;
}) {
  const { fetchInboundPayments } = await import("./admin-moderation.server");
  const { INBOUND_CSV_COLUMNS, inboundCsvRows } = await import("./payments");

  const perPage = Math.min(200, Math.max(20, opts.perPage ?? EXPORT_CHUNK_SIZE));
  const page = Math.max(1, opts.page);
  const filters = opts.filters ?? {};

  const result = await fetchInboundPayments(page, perPage);
  const kept = result.rows.filter((row) => matchesFilters(row, filters));

  const scanned = (page - 1) * perPage + result.rows.length;

  return {
    columns: [...INBOUND_CSV_COLUMNS],
    rows: inboundCsvRows(kept),
    page,
    perPage,
    scanned,
    total: result.total,
    done: scanned >= result.total || result.rows.length === 0,
  };
}
