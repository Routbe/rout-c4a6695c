/** Passkeys (WebAuthn) via Better Auth's passkey plugin on our own server. */
import { authClient } from "@/lib/auth-client";
import { passkeyErrorMessage } from "@/lib/passkey-errors";

export const passkeysAvailable = true;

type Row = { id: string; name?: string | null; createdAt?: string | Date | null };

function fail(error: { message?: string; code?: string } | null | undefined, fallback: string): never {
  throw new Error(error?.message || error?.code || fallback);
}

export async function listPasskeys() {
  const res = await authClient.passkey.listUserPasskeys();
  if (res.error) fail(res.error, "Could not load passkeys.");
  return ((res.data ?? []) as Row[]).map((p) => ({
    id: p.id,
    device_label: p.name ?? null,
    created_at: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
    last_used_at: null as string | null,
  }));
}

export async function addPasskey(name: string) {
  const res = await authClient.passkey.addPasskey({ name });
  if (res?.error) {
    const e = res.error as { code?: string; status?: number; message?: string };
    console.error("[passkeys] register failed", e.code, e.status, e.message);
    return { ok: false as const, code: e.code, reason: passkeyErrorMessage(e.code, e.status, e.message) };
  }
  return { ok: true as const };
}

export async function deletePasskey({ data }: { data: { id: string } }) {
  const res = await authClient.passkey.deletePasskey({ id: data.id });
  if (res.error) fail(res.error, "Delete was refused.");
  return { ok: true };
}

export async function signInWithPasskey() {
  const res = await authClient.signIn.passkey();
  if (res?.error) return { ok: false as const, reason: res.error.message ?? "Passkey sign-in failed." };
  return { ok: true as const };
}
