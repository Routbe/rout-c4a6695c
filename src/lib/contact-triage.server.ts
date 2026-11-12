import { contactTriageInput, triageContact } from "./contact-triage";

/** Staff-only contact triage, computed locally. Message contents are never logged or stored. */
export async function analyzeContactForSupport(userId: string, input: unknown) {
  if (!userId) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  const { assertAdminPermission } = await import("./admin-access.server");
  await assertAdminPermission(userId, "triage_contact");
  const { message } = contactTriageInput.parse(input);
  return { ok: true as const, result: triageContact(message) };
}
