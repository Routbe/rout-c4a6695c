/**
 * Chronos — pure rules for the agent audit log, rollbacks and outbound
 * webhooks. Browser-safe; the server side lives in chronos.server.ts.
 *
 * Zero-trust rules:
 * - Every agent mutation is logged with a `previous_state` snapshot; human
 *   mutations create no snapshots (they are the safety net, not the risk).
 * - Only actions with a known inverse are revertible.
 * - Webhooks are outbound-only POSTs to the agent's registered https URL.
 */

export const AGENT_ACTIONS = ["link.create", "profile_draft.update", "workspace.provision"] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];

export const AGENT_WEBHOOK_EVENTS = ["workspace.upgraded", "domain.verified"] as const;
export type AgentWebhookEvent = (typeof AGENT_WEBHOOK_EVENTS)[number];

/** JSON-only snapshots: the timeline crosses the server-fn boundary. */
export type ChronosJson = string | number | boolean | null | ChronosJson[] | { [key: string]: ChronosJson };

export type AgentAuditEntry = {
  id: string;
  workspaceId: string | null;
  userId: string;
  actorClientId: string;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  previousState: ChronosJson;
  newState: ChronosJson;
  revertedAt: string | null;
  createdAt: string;
};

/** How a logged action is undone; null means "not revertible". */
export function revertStrategy(action: string): "delete_target" | "restore_previous" | "delete_workspace" | null {
  switch (action) {
    case "link.create":
      return "delete_target";
    case "profile_draft.update":
      return "restore_previous";
    case "workspace.provision":
      return "delete_workspace";
    default:
      return null;
  }
}

/** A log entry can be reverted once, and only when its action has an inverse. */
export function canRevert(entry: Pick<AgentAuditEntry, "action" | "revertedAt">): boolean {
  return entry.revertedAt === null && revertStrategy(entry.action) !== null;
}

/** Outbound webhook payload — deliberately minimal, no PII. */
export function agentWebhookPayload(event: AgentWebhookEvent, workspaceId: string, now = new Date()): {
  event: AgentWebhookEvent;
  workspace_id: string;
  timestamp: string;
} {
  return { event, workspace_id: workspaceId, timestamp: now.toISOString() };
}

/** Registered webhook URLs must be https and bounded. */
export function isAgentWebhookUrl(raw: string): boolean {
  const v = raw.trim();
  if (!v || v.length > 2048) return false;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}
