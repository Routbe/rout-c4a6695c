import { sql, withDbContext } from "@/lib/neon";
import { assertWorkspaceRole } from "@/lib/workspaces.server";
import {
  agentWebhookPayload,
  canRevert,
  revertStrategy,
  type AgentAction,
  type AgentAuditEntry,
  type AgentWebhookEvent,
} from "./chronos";

/**
 * Chronos server side. The log is append-only for the app role (definer
 * `rout_agent_audit_log`); reads and the revert marker are scoped to
 * workspace owners/admins. Auditing never blocks the action it records.
 */

type AuditRow = {
  id: string;
  workspace_id: string | null;
  user_id: string;
  actor_client_id: string;
  action: string;
  target_table: string | null;
  target_id: string | null;
  previous_state: unknown;
  new_state: unknown;
  reverted_at: string | null;
  created_at: string;
};

const toEntry = (r: AuditRow): AgentAuditEntry => ({
  id: r.id,
  workspaceId: r.workspace_id,
  userId: r.user_id,
  actorClientId: r.actor_client_id,
  action: r.action,
  targetTable: r.target_table,
  targetId: r.target_id,
  previousState: (r.previous_state ?? null) as AgentAuditEntry["previousState"],
  newState: (r.new_state ?? null) as AgentAuditEntry["newState"],
  revertedAt: r.reverted_at,
  createdAt: r.created_at,
});

/** Records one agent mutation with its snapshot. Never throws. */
export async function recordAgentMutation(input: {
  workspaceId: string | null;
  userId: string;
  clientId: string;
  action: AgentAction;
  targetTable?: string | null;
  targetId?: string | null;
  previousState?: unknown;
  newState?: unknown;
}): Promise<void> {
  try {
    await withDbContext({ userId: input.userId, workspaceId: input.workspaceId }, async () => {
      await sql`
        select public.rout_agent_audit_log(
          ${input.workspaceId}, ${input.userId}, ${input.clientId}, ${input.action},
          ${input.targetTable ?? null}, ${input.targetId ?? null},
          ${input.previousState === undefined ? null : JSON.stringify(input.previousState)}::jsonb,
          ${input.newState === undefined ? null : JSON.stringify(input.newState)}::jsonb
        )
      `;
    });
  } catch (error) {
    console.warn("[chronos] write failed", { action: input.action, error: (error as Error).message });
  }
}

/** The workspace timeline for the settings UI. Owner/admin only (RLS). */
export async function listAgentAudit(userId: string, workspaceId: string): Promise<AgentAuditEntry[]> {
  return withDbContext({ userId, workspaceId }, async () => {
    await assertWorkspaceRole(userId, workspaceId, ["owner", "admin"]);
    const rows = (await sql`
      select * from public.agent_audit_logs
       where workspace_id = ${workspaceId}
       order by created_at desc
       limit 50
    `) as AuditRow[];
    return rows.map(toEntry);
  });
}

export class RevertError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Reverts one agent action using its stored snapshot. Owner/admin of the
 * workspace only; each entry reverts exactly once.
 */
export async function revertAgentMutation(userId: string, logId: string): Promise<{ reverted: true; action: string }> {
  return withDbContext({ userId, workspaceId: null }, async () => {
    const rows = (await sql`select * from public.agent_audit_logs where id = ${logId} limit 1`) as AuditRow[];
    const row = rows[0];
    if (!row) throw new RevertError("Logregel niet gevonden.", 404);
    const entry = toEntry(row);
    // The delegating human may always revert their own agent; otherwise the
    // workspace owner/admin may. Unclaimed staging workspaces have no members,
    // so the delegating human is the only possible reverter there.
    if (entry.userId !== userId) {
      if (!entry.workspaceId) throw new RevertError("Geen toegang tot deze logregel.", 403);
      await assertWorkspaceRole(userId, entry.workspaceId, ["owner", "admin"]);
    }
    if (!canRevert(entry)) throw new RevertError("Deze actie kan niet (meer) worden teruggedraaid.", 409);

    const strategy = revertStrategy(entry.action);
    if (strategy === "delete_target") {
      if (entry.targetTable !== "tracked_qrs" || !entry.targetId) throw new RevertError("Onbekend doel voor deze actie.", 400);
      await sql`delete from public.tracked_qrs where id = ${entry.targetId} and user_id = ${entry.userId}`;
    } else if (strategy === "restore_previous") {
      const previous = entry.previousState as { fields?: Record<string, unknown> } | null;
      if (!previous?.fields) throw new RevertError("Er is geen eerdere staat opgeslagen voor deze actie.", 400);
      const space = (entry.newState as { space?: string } | null)?.space;
      if (space !== "alias" && space !== "verified") throw new RevertError("Onbekend profielcanvas voor deze actie.", 400);
      const { patchProfileDraft } = await import("@/lib/profile-drafts.server");
      await patchProfileDraft(entry.userId, space, { fields: previous.fields });
    } else if (strategy === "delete_workspace") {
      if (!entry.targetId) throw new RevertError("Onbekend doel voor deze actie.", 400);
      // Definer hard-deletes only an unclaimed workspace this human's agent made.
      await sql`select public.rout_agent_audit_revert_workspace(${entry.targetId})`;
    }

    await sql`select public.rout_agent_audit_mark_reverted(${logId})`;
    return { reverted: true, action: entry.action };
  });
}

/**
 * Outbound event to every agent webhook registered on the workspace's OAuth
 * clients. Fire-and-forget: a slow or dead endpoint never blocks the human's
 * action, and failures are only logged.
 */
export async function emitAgentWebhook(workspaceId: string, event: AgentWebhookEvent): Promise<void> {
  try {
    const rows = (await sql`
      select agent_webhook_url from public.oauth_clients
       where workspace_id = ${workspaceId} and agent_webhook_url is not null
    `) as { agent_webhook_url: string }[];
    const payload = JSON.stringify(agentWebhookPayload(event, workspaceId));
    await Promise.allSettled(
      rows.map((r) =>
        fetch(r.agent_webhook_url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
          signal: AbortSignal.timeout(5_000),
        }).then((res) => {
          if (!res.ok) console.warn("[chronos] webhook rejected", { event, status: res.status });
        }),
      ),
    );
  } catch (error) {
    console.warn("[chronos] webhook emit failed", { event, error: (error as Error).message });
  }
}
