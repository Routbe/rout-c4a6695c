import { queryOptions } from "@tanstack/react-query";
import { getCommandOverview, getFinanceOverview, getInfrastructureOverview } from "./admin-control.functions";

export const commandQuery = queryOptions({ queryKey: ["admin-command"], queryFn: () => getCommandOverview(), staleTime: 30_000, retry: false });
export const financeQuery = (search = "", cursor: string | null = null) => queryOptions({ queryKey: ["admin-finance", search, cursor],
  queryFn: () => getFinanceOverview({ data: { search, cursor } }), staleTime: 30_000, retry: false });
export type InfraStatus = "all" | "failed" | "done" | "success" | "processing" | "active" | "pending" | "paused";
export const infraQuery = (kind: "webhooks" | "subdomains" | "aliases" = "webhooks", search = "", status: InfraStatus = "all", cursor: string | null = null) => queryOptions({
  queryKey: ["admin-infra", kind, search, status, cursor], queryFn: () => getInfrastructureOverview({ data: { kind, search, status, cursor } }), staleTime: 30_000, retry: false,
  refetchInterval: (query) => kind === "webhooks" && cursor === null && query.state.status !== "error" ? 60_000 : false, refetchIntervalInBackground: false });