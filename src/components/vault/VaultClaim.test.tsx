import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  user: { id: "A" } as { id: string } | null,
  prepare: vi.fn(), decrypt: vi.fn(), reseal: vi.fn(), discard: vi.fn(async () => null),
  status: vi.fn(), generate: vi.fn(), discardMaster: vi.fn(async () => null), open: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock("@/lib/vault/ephemeral-vault.functions", () => ({ openEphemeralVault: mock.open }));
vi.mock("@/lib/crypto-enclave/client", async (original) => ({
  ...await original<typeof import("@/lib/crypto-enclave/client")>(),
  enclave: {
    vault: { prepare: mock.prepare, decrypt: mock.decrypt, reseal: mock.reseal, discard: mock.discard },
    deviceKey: { status: mock.status },
    masterKey: { generate: mock.generate, discardPending: mock.discardMaster },
  },
}));
import { VaultClaim } from "./VaultClaim";

describe("owner-bound vault cryptography", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mock.user = { id: "A" };
    mock.prepare.mockImplementation(async () => ({ handle: `vault-${mock.user?.id}`, claimProof: "proof" }));
    mock.open.mockResolvedValue({ status: "ok", encryptedPayload: "ciphertext", expiresAt: "2099-01-01T00:00:00.000Z" });
    mock.decrypt.mockResolvedValue({ name: "Private workspace" });
    mock.status.mockImplementation(async (id: string) => ({ keyId: `key-${id}` }));
    mock.reseal.mockImplementation(async (_handle: string, userId: string) => ({ encrypted: `ciphertext-${userId}`, keyId: `key-${userId}` }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  const props = { vaultId: "vault-id", secret: "provided-code", onCancel: vi.fn() };
  it("never reuses owner A retry ciphertext after switching to owner B", async () => {
    const fetcher = vi.fn(async (_url: string, _options: { body: string }) => ({ ok: false, json: async () => ({ error: "network" }) }));
    vi.stubGlobal("fetch", fetcher);
    const view = render(<VaultClaim {...props} />);
    const button = await screen.findByRole("button", { name: "Versleutelen en claimen" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ encrypted_config: "ciphertext-A", key_id: "key-A" });
    mock.user = { id: "B" }; view.rerender(<VaultClaim {...props} />);
    await waitFor(() => expect(mock.status).toHaveBeenCalledWith("B"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Versleutelen en claimen" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Versleutelen en claimen" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(mock.reseal).toHaveBeenLastCalledWith("vault-B", "B");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ encrypted_config: "ciphertext-B", key_id: "key-B" });
  });
  it("discards a generated master handle arriving after the claim screen is closed", async () => {
    mock.status.mockResolvedValue(null);
    let resolve: ((value: { handle: string; mnemonic: string }) => void) | undefined;
    mock.generate.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const view = render(<VaultClaim {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Nieuwe Master Key maken" }));
    view.unmount();
    await act(async () => { resolve?.({ handle: "late-master", mnemonic: "recovery words" }); });
    expect(mock.discardMaster).toHaveBeenCalledWith("late-master");
  });
});