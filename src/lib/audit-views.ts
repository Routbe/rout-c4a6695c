/**
 * Saved audit-log filter sets ("favourite views").
 *
 * Stored per browser so an admin can jump back into a recurring investigation
 * (for example: every PAYMENT_REPROCESSED entry of the last week) in one click.
 */
export type AuditFilters = {
  adminEmail: string;
  action: string;
  from: string;
  to: string;
  search: string;
};

export type SavedAuditView = {
  id: string;
  name: string;
  filters: AuditFilters;
  createdAt: string;
};

const STORAGE_KEY = "rout.admin.auditViews.v1";

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  adminEmail: "",
  action: "",
  from: "",
  to: "",
  search: "",
};

/** Built-in quick filters that always exist, even for a fresh browser. */
export const BUILTIN_AUDIT_VIEWS: SavedAuditView[] = [
  {
    id: "builtin:reprocessed",
    name: "Reprocessed payments",
    filters: { ...EMPTY_AUDIT_FILTERS, action: "PAYMENT_REPROCESSED" },
    createdAt: "",
  },
  {
    id: "builtin:bans",
    name: "Bans & suspensions",
    filters: { ...EMPTY_AUDIT_FILTERS, search: "BAN" },
    createdAt: "",
  },
];

function readStore(): SavedAuditView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (v): v is SavedAuditView => Boolean(v) && typeof (v as SavedAuditView).id === "string",
      )
      .map((v) => ({ ...v, filters: { ...EMPTY_AUDIT_FILTERS, ...v.filters } }));
  } catch {
    return [];
  }
}

function writeStore(views: SavedAuditView[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    /* private mode / quota — favourites are a convenience, never a blocker */
  }
}

export function listAuditViews(): SavedAuditView[] {
  return [...BUILTIN_AUDIT_VIEWS, ...readStore()];
}

/** Saving twice under the same name updates that view in place. */
export function saveAuditView(name: string, filters: AuditFilters): SavedAuditView[] {
  const trimmed = name.trim().slice(0, 60);
  if (!trimmed) return listAuditViews();
  const existing = readStore().filter((v) => v.name.toLowerCase() !== trimmed.toLowerCase());
  const next: SavedAuditView[] = [
    {
      id: `view:${Date.now().toString(36)}`,
      name: trimmed,
      filters: { ...EMPTY_AUDIT_FILTERS, ...filters },
      createdAt: new Date().toISOString(),
    },
    ...existing,
  ].slice(0, 25);
  writeStore(next);
  return listAuditViews();
}

export function deleteAuditView(id: string): SavedAuditView[] {
  writeStore(readStore().filter((v) => v.id !== id));
  return listAuditViews();
}

export function isBuiltinView(id: string) {
  return id.startsWith("builtin:");
}

/** True when the current filter set matches a saved view exactly. */
export function viewMatches(view: SavedAuditView, filters: AuditFilters) {
  return (
    view.filters.adminEmail === filters.adminEmail &&
    view.filters.action === filters.action &&
    view.filters.from === filters.from &&
    view.filters.to === filters.to &&
    view.filters.search === filters.search
  );
}
