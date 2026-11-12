import { describe, expect, it } from "vitest";
import { dequeue, enqueue, isRetryable, type OutboxMutation } from "./outbox";

const m = (id: string, relayId: string, status: "active" | "paused"): OutboxMutation => ({
  id, kind: "relay.status", relayId, status, queuedAt: 0,
});

describe("local-first outbox", () => {
  it("keeps only the latest status per relay", () => {
    const q = enqueue(enqueue(enqueue([], m("1", "r1", "paused")), m("2", "r2", "paused")), m("3", "r1", "active"));
    expect(q.map((x) => [x.relayId, x.status])).toEqual([["r2", "paused"], ["r1", "active"]]);
  });

  it("removes a mutation once the server confirmed it", () => {
    expect(dequeue([m("1", "r1", "paused")], "1")).toEqual([]);
  });

  it("retries network and server errors but drops rejections", () => {
    expect(isRetryable(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryable({ status: 503 })).toBe(true);
    expect(isRetryable(new Error("Deze relay bestaat niet (meer)."))).toBe(false);
  });
});
