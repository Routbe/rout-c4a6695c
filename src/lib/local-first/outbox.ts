/**
 * Local-first outbox: optimistic mutations are applied to the UI immediately
 * and queued here; a background flush pushes them to the server in order.
 * The queue is persisted (snapshot store) so a closed tab or offline moment
 * never loses a change. Pure queue rules live here so they are testable.
 */
import { readSnapshot, writeSnapshot } from "./snapshot-store";

export type OutboxMutation = {
  id: string;
  kind: "relay.status";
  relayId: string;
  status: "active" | "paused";
  queuedAt: number;
};

/** A newer change to the same relay replaces the older one (last write wins). */
export function enqueue(queue: OutboxMutation[], m: OutboxMutation): OutboxMutation[] {
  return [...queue.filter((q) => !(q.kind === m.kind && q.relayId === m.relayId)), m];
}

export function dequeue(queue: OutboxMutation[], id: string): OutboxMutation[] {
  return queue.filter((q) => q.id !== id);
}

/** Network trouble keeps a mutation queued; a server rejection drops it. */
export function isRetryable(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (error instanceof TypeError) return true; // fetch network failure
  const status = (error as { status?: number; statusCode?: number } | null)?.status ??
    (error as { statusCode?: number } | null)?.statusCode;
  return typeof status === "number" && (status === 0 || status === 429 || status >= 500);
}

const keyFor = (userId: string) => `outbox:${userId}`;

export async function loadQueue(userId: string): Promise<OutboxMutation[]> {
  return (await readSnapshot<OutboxMutation[]>(keyFor(userId)))?.value ?? [];
}

export async function saveQueue(userId: string, queue: OutboxMutation[]): Promise<void> {
  await writeSnapshot(keyFor(userId), queue);
}
