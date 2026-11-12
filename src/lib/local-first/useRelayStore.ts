import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listIdentityRelays,
  setIdentityRelayStatus,
  type IdentityRelay,
} from "@/lib/oauth/identity-relays.functions";
import { useLocalFirst } from "./useLocalFirst";
import { dequeue, enqueue, isRetryable, loadQueue, saveQueue, type OutboxMutation } from "./outbox";

/**
 * Shared local-first store for identity relays (cockpit widget + identity page).
 * Toggles update the UI at 0 ms, are queued in the persisted outbox and flushed
 * in the background; rejected changes roll back with a message.
 */
export function useRelayStore(userId: string | null) {
  const list = useServerFn(listIdentityRelays);
  const setStatus = useServerFn(setIdentityRelayStatus);
  const state = useLocalFirst<IdentityRelay[]>(userId ? `relays:${userId}` : null, () => list());
  const [pending, setPending] = useState(0);
  const flushing = useRef(false);
  const refreshRef = useRef(state.refresh);
  refreshRef.current = state.refresh;
  const { mutate } = state;

  const flush = useCallback(async () => {
    if (!userId || flushing.current) return;
    flushing.current = true;
    try {
      let queue = await loadQueue(userId);
      let changed = false;
      for (const m of [...queue]) {
        try {
          await setStatus({ data: { relayId: m.relayId, status: m.status } });
          queue = dequeue(queue, m.id);
          changed = true;
        } catch (e) {
          if (isRetryable(e)) break;
          queue = dequeue(queue, m.id);
          changed = true;
          toast.error(e instanceof Error ? e.message : "Wijziging geweigerd.");
        }
        await saveQueue(userId, queue);
      }
      setPending(queue.length);
      if (changed) void refreshRef.current();
    } finally {
      flushing.current = false;
    }
  }, [userId, setStatus]);

  // Resume anything left from a previous session, and retry when back online.
  useEffect(() => {
    if (!userId) return;
    void loadQueue(userId).then((q) => {
      setPending(q.length);
      if (q.length) void flush();
    });
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [userId, flush]);

  const toggle = useCallback(
    async (relay: IdentityRelay) => {
      if (!userId) return;
      const status = relay.status === "active" ? "paused" : "active";
      mutate((prev) => (prev ?? []).map((r) => (r.id === relay.id ? { ...r, status } : r)));
      const m: OutboxMutation = { id: crypto.randomUUID(), kind: "relay.status", relayId: relay.id, status, queuedAt: Date.now() };
      const queue = enqueue(await loadQueue(userId), m);
      await saveQueue(userId, queue);
      setPending(queue.length);
      void flush();
    },
    [userId, mutate, flush],
  );

  return { relays: state.data, syncing: state.syncing || pending > 0, pending, toggle, refresh: state.refresh, error: state.error };
}
