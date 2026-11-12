import type {
  listPendingVerifications,
  listUsers,
  listTransactions,
  listAuditLogPage,
  listAliases,
  getSystemHealth,
} from "@/lib/admin.functions";

export type Pending = Awaited<ReturnType<typeof listPendingVerifications>>[number];
export type UserRow = Awaited<ReturnType<typeof listUsers>>["rows"][number];
export type TxRow = Awaited<ReturnType<typeof listTransactions>>["rows"][number];
export type AuditRow = Awaited<ReturnType<typeof listAuditLogPage>>["rows"][number];
export type AliasRow = Awaited<ReturnType<typeof listAliases>>["page"]["rows"][number];
export type AliasHealth = Awaited<ReturnType<typeof listAliases>>["health"];
export type BulkAction = "suspend" | "unsuspend" | "ban" | "cleanse";

/** KPI-tegels waarop een admin kan doorklikken naar de onderliggende profielen. */
export type KpiMetric =
  | "activeUsers"
  | "pendingVerifications"
  | "incompletePayments"
  | "pendingSepaPayments"
  | "failedAliasSyncs";

export type Health = Awaited<ReturnType<typeof getSystemHealth>>;

/** A pending confirmation for any destructive or irreversible admin action. */
export type Confirmation = {
  title: string;
  description: string;
  actionLabel: string;
  destructive?: boolean;
  withReason?: boolean;
  run: (reason?: string) => Promise<void> | void;
};
