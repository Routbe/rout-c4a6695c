import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PER_PAGE_OPTIONS, SYNC_LABEL, STATUS_STYLE, shortDateTime } from "@/lib/admin-format";

/**
 * Alias sync indicator. A profile that has never been touched by ImprovMX can
 * never read "Synced": without a timestamp the state is "Not synced yet".
 */
export function SyncBadge({
  status,
  at,
  attempts,
  error,
}: {
  status: string;
  at: string | null;
  attempts?: number;
  error?: string | null;
}) {
  const effective = status === "synced" && !at ? "pending" : status;
  const label = at ? shortDateTime(at) : "never synced";
  return (
    <span className="inline-flex flex-col" data-testid="sync-badge" data-status={effective}>
      <span className="text-[11px]">
        {at ? (SYNC_LABEL[effective] ?? SYNC_LABEL["pending"]) : "Not synced yet ⚪"}
      </span>
      <span className="text-[10px] text-muted-foreground">
        {label}
        {effective === "failed" && attempts ? ` · ${attempts} attempts` : ""}
      </span>
      {effective === "failed" && error ? (
        <span className="max-w-[16rem] truncate text-[10px] text-destructive">{error}</span>
      ) : null}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  // Known statuses get a localised label; unknown ones fall through untouched.
  const label = t(`admin.status.${status}`, { defaultValue: status });
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        STATUS_STYLE[status] ?? "bg-muted text-foreground/80"
      }`}
    >
      {label}
    </span>
  );
}

/** Shared "Showing 1-20 of 150" pager used by every paginated tab. */
export function Pager({
  page,
  perPage,
  total,
  loading,
  onPage,
  onPerPage,
  idPrefix,
}: {
  page: number;
  perPage: number;
  total: number;
  loading?: boolean;
  onPage: (p: number) => void;
  onPerPage: (n: number) => void;
  idPrefix: string;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(total, page * perPage);
  const windowed = [...Array(pages).keys()]
    .map((i) => i + 1)
    .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-xs">
      <p data-testid={`${idPrefix}-range`} className="text-muted-foreground">
        {loading ? "Loading…" : `Showing ${first}-${last} of ${total} entries`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={`${idPrefix}-per-page`} className="text-xs text-muted-foreground">
          Per page
        </Label>
        <select
          id={`${idPrefix}-per-page`}
          data-testid={`${idPrefix}-per-page`}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          value={perPage}
          onChange={(e) => onPerPage(Number(e.target.value))}
        >
          {PER_PAGE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          data-testid={`${idPrefix}-prev`}
          disabled={page <= 1 || loading}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        {windowed.map((p, i) => (
          <span key={p} className="flex items-center gap-1">
            {i > 0 && p - (windowed[i - 1] ?? 0) > 1 ? (
              <span className="text-muted-foreground">…</span>
            ) : null}
            <Button
              size="sm"
              variant={p === page ? "default" : "outline"}
              className="h-8 w-8 p-0"
              aria-current={p === page ? "page" : undefined}
              disabled={loading}
              onClick={() => onPage(p)}
            >
              {p}
            </Button>
          </span>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          data-testid={`${idPrefix}-next`}
          disabled={page >= pages || loading}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
