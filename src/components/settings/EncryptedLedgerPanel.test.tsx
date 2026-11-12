import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ keys: vi.fn(), list: vi.fn(), save: vi.fn(), audit: vi.fn(), decrypt: vi.fn(), unlock: vi.fn(async () => null), lock: vi.fn(async () => null), generate: vi.fn(), discard: vi.fn(async () => null), activate: vi.fn(async () => null) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "A" } }) }));
vi.mock("@/lib/ledger/ledger.functions", () => ({ getLedgerKeys: mock.keys, listEncryptedLedger: mock.list, saveLedgerKeys: mock.save }));
vi.mock("@/lib/security/audit-verifier.functions", () => ({ getDisclosureAudit: mock.audit }));
vi.mock("@/lib/crypto-enclave/client", async (original) => ({
  ...await original<typeof import("@/lib/crypto-enclave/client")>(),
  enclave: { ledger: { unlock: mock.unlock, decrypt: mock.decrypt, lock: mock.lock, generate: mock.generate, discardPending: mock.discard, activate: mock.activate } },
}));
import { EncryptedLedgerPanel } from "./EncryptedLedgerPanel";
import { EnclaveError, terminateEnclave } from "@/lib/crypto-enclave/client";

describe("ledger plaintext lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.keys.mockResolvedValue([{ key_id: "key", retired_at: null, encrypted_ledger_private_key: [{ v: 1, source: "recovery", salt: "", iv: "", ciphertext: "" }] }]);
    mock.list.mockResolvedValue([{ id: "record", key_id: "key", encrypted_payload: "ciphertext", created_at: "2026-11-07T00:00:00Z" }]);
    mock.audit.mockResolvedValue({ rows: [], verified: false });
  });
  afterEach(cleanup);
  it("does not redisplay plaintext when a decrypt completes after the member locks the ledger", async () => {
    let resolve: ((value: Record<string, string>) => void) | undefined;
    mock.decrypt.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    render(<EncryptedLedgerPanel />);
    fireEvent.change(await screen.findByLabelText("Logboekherstelcode"), { target: { value: "provided-code" } });
    fireEvent.click(screen.getByRole("button", { name: "Lokaal ontsleutelen" }));
    await waitFor(() => expect(mock.decrypt).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: "Vergrendelen" }));
    await act(async () => { resolve?.({ record: "PRIVATE_RECORD" }); });
    expect(screen.queryByText("PRIVATE_RECORD")).not.toBeInTheDocument();
    expect(mock.lock).toHaveBeenCalled();
  });
  it("discards a pending key generated after the ledger screen unmounts", async () => {
    let resolve: ((value: unknown) => void) | undefined;
    mock.generate.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const view = render(<EncryptedLedgerPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Nieuwe logboeksleutel" }));
    view.unmount();
    await act(async () => { resolve?.({ keyId: "late-key", publicKey: {}, envelopes: [], recoveryCode: "recovery" }); });
    expect(mock.discard).toHaveBeenCalledWith("late-key");
    expect(mock.activate).not.toHaveBeenCalled();
  });
  it("shows a worker failure and re-enables controls rather than remaining stuck busy", async () => {
    mock.generate.mockImplementationOnce(async () => { terminateEnclave("timeout"); throw new EnclaveError("timeout"); });
    render(<EncryptedLedgerPanel />);
    const button = await screen.findByRole("button", { name: "Nieuwe logboeksleutel" });
    fireEvent.click(button);
    await screen.findByRole("alert");
    await waitFor(() => expect(button).toBeEnabled());
  });
});