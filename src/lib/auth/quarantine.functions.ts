import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/middleware";

/** Admin queue for passkey-less (quarantined) accounts asking to get back in. */
export const listRecoveryRequestsFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { assertAdminRole } = await import("@/lib/admin.server");
    await assertAdminRole(context.userId);
    const { listRecoveryRequests } = await import("./quarantine.server");
    return listRecoveryRequests();
  });

type Decision = { id: string; note?: string | null };
const decision = (input: Decision) => {
  if (!input || typeof input.id !== "string" || !/^[0-9a-f-]{36}$/i.test(input.id)) throw new Error("invalid_id");
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 1000) || null : null;
  return { id: input.id, note };
};

/** Approve AFTER out-of-band identity verification. The binding link is shown once. */
export const approveRecoveryRequestFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(decision)
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("@/lib/admin.server");
    await assertAdminRole(context.userId);
    if (!data.note) throw new Error("verification_note_required");
    const { approveRecoveryRequest } = await import("./quarantine.server");
    const token = await approveRecoveryRequest(data.id, context.userId, data.note);
    if (!token) return { ok: false as const };
    const { canonicalAppUrl } = await import("@/lib/app-url");
    return { ok: true as const, link: `${canonicalAppUrl().replace(/\/+$/, "")}/auth/recovery?token=${token}` };
  });

export const denyRecoveryRequestFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(decision)
  .handler(async ({ data, context }) => {
    const { assertAdminRole } = await import("@/lib/admin.server");
    await assertAdminRole(context.userId);
    const { denyRecoveryRequest } = await import("./quarantine.server");
    return { ok: await denyRecoveryRequest(data.id, context.userId, data.note) };
  });
