import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCryptoLifecycle } from "@/hooks/useCryptoLifecycle";
import { useServerFn } from "@tanstack/react-start";
import { LockKeyhole, ShieldCheck, RefreshCw, Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { getLedgerKeys, listEncryptedLedger, saveLedgerKeys } from "@/lib/ledger/ledger.functions";
import { getDisclosureAudit } from "@/lib/security/audit-verifier.functions";
import { captureEnclaveScope, enclave, EnclaveError, type LedgerDraft } from "@/lib/crypto-enclave/client";
import type { PrivateEnvelope } from "@/lib/ledger/crypto";
import type { LedgerPublicKey } from "@/lib/ledger/ledger.functions";

type KeyRow = { key_id: string; encrypted_ledger_private_key: (PrivateEnvelope & { credentialId?: string })[]; retired_at: string | null };
type LogRow = { id: string; key_id: string; encrypted_payload: string; created_at: string };

/** Enclave failures as member-facing text; raw messages never reach the screen. */
function enclaveMessage(e: unknown): string {
  if (!(e instanceof EnclaveError)) return e instanceof Error ? e.message : "Logboek niet beschikbaar.";
  switch (e.code) {
    case "invalid_input": return "Ongeldige herstelcode";
    case "decrypt_failed": return "Ontsleutelen mislukt. Controleer je herstelcode of passkey.";
    case "unknown_handle": return "Sleutel verlopen. Maak of ontgrendel hem opnieuw.";
    case "enclave_unavailable": return "Je browser blokkeert de beveiligde versleutelingsomgeving.";
    default: return "Versleuteling mislukt. Probeer opnieuw.";
  }
}

/**
 * Encrypted activity ledger. All key work happens in the cryptographic enclave
 * worker: this component holds only public keys, ciphertext, the one-time
 * recovery code shown to the member and the plaintext it chose to display.
 */
export function EncryptedLedgerPanel() {
  const { user } = useAuth();
  return user ? <EncryptedLedgerSession key={user.id} /> : null;
}

function EncryptedLedgerSession() {
  const { capture, invalidate } = useCryptoLifecycle();
  const fetchKeys = useServerFn(getLedgerKeys), list = useServerFn(listEncryptedLedger), save = useServerFn(saveLedgerKeys), audit = useServerFn(getDisclosureAudit);
  const [keys, setKeys] = useState<KeyRow[]>([]), [pending, setPending] = useState<LedgerDraft | null>(null);
  const [prfCredential, setPrfCredential] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(""), [acknowledged, setAcknowledged] = useState(false), [usePrf, setUsePrf] = useState(false);
  const [rows, setRows] = useState<LogRow[]>([]), [decoded, setDecoded] = useState<Record<string, string>>({});
  const [unlockedKeyId, setUnlockedKeyId] = useState<string | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<Awaited<ReturnType<typeof getDisclosureAudit>> | null>(null);
  const active = keys.find((k) => !k.retired_at);
  async function refresh() {
    const scope = capture();
    const [k, logs, verified] = await Promise.all([fetchKeys(), list({ data: {} }), audit()]);
    scope.assertCurrent();
    setKeys(k as unknown as KeyRow[]); setRows(logs as unknown as LogRow[]); setIntegrity(verified);
    return logs as unknown as LogRow[];
  }
  useEffect(() => { void refresh().catch(() => setError("Logboek niet beschikbaar. De nieuwe beveiligingsmigraties moeten actief zijn.")); }, []);
  // Leaving the page locks the ledger: the enclave drops its private keys.
  useEffect(() => {
    const workerScope = captureEnclaveScope();
    return () => {
      try { workerScope.assertCurrent(); } catch { return; }
      void enclave.ledger.lock().catch(() => undefined);
    };
  }, []);
  async function run(task: () => Promise<void>) {
    const scope = capture();
    setBusy(true); setError(null);
    try { await task(); } catch (e) { if (scope.isUiCurrent()) setError(enclaveMessage(e)); } finally { if (scope.isUiCurrent()) setBusy(false); }
  }
  async function prepare() {
    const scope = capture();
    setPrfCredential(null);
    if (usePrf) {
      // React receives only the draft and public credential ID, never PRF key bytes.
      const prf = await import("@/lib/ledger/prf");
      scope.assertCurrent();
      const result = await prf.generateLedgerWithPasskey(scope);
      if (!result) throw new Error("Deze passkey ondersteunt geen PRF. Kies herstelcode of een geschikte passkey.");
      if (!scope.isCurrent()) { void enclave.ledger.discardPending(result.draft.keyId).catch(() => undefined); return; }
      setPrfCredential(result.credentialId);
      setPending(result.draft);
    } else {
      const draft = await enclave.ledger.generate();
      if (!scope.isCurrent()) { void enclave.ledger.discardPending(draft.keyId).catch(() => undefined); return; }
      setPending(draft);
    }
    setAcknowledged(false);
  }
  async function activate() {
    if (!pending || !acknowledged) return;
    const scope = capture();
    const envelopes = pending.envelopes.map((e) => e.source === "prf" ? { ...e, credentialId: prfCredential ?? undefined } : e);
    await save({ data: { publicKey: pending.publicKey as LedgerPublicKey, envelopes, expectedKeyId: active?.key_id ?? null } });
    scope.assertCurrent();
    await enclave.ledger.activate(pending.keyId);
    scope.assertCurrent();
    setUnlockedKeyId(pending.keyId); setPending(null); setRecovery(""); setDecoded({}); await refresh();
  }
  function cancelPending() {
    invalidate();
    setBusy(false);
    if (pending) void enclave.ledger.discardPending(pending.keyId).catch(() => undefined);
    setPending(null);
  }
  async function unlock(prf: boolean) {
    const scope = capture();
    const envelopeKey = keys.find((k) => prf ? k.key_id === active?.key_id : k.key_id === (selectedKeyId || active?.key_id));
    if (!envelopeKey) throw new Error("Geen sleutel beschikbaar.");
    const envelopes = envelopeKey.encrypted_ledger_private_key;
    const envelope = envelopes.find((e) => e.source === (prf ? "prf" : "recovery"));
    if (!envelope) throw new Error("Geen geschikte sleutelenvelop.");
    if (prf) {
      const prf = await import("@/lib/ledger/prf");
      scope.assertCurrent();
      const result = await prf.unlockLedgerWithPasskey(envelopeKey.key_id, envelope, envelope.credentialId, scope);
      if (!result) throw new Error("Passkey PRF niet beschikbaar.");
    } else {
      await enclave.ledger.unlock(envelopeKey.key_id, envelope, { recoveryCode: recovery.trim() });
    }
    scope.assertCurrent();
    setUnlockedKeyId(envelopeKey.key_id); setRecovery("");
    const items = rows.filter((r) => r.key_id === envelopeKey.key_id).map((r) => ({ id: r.id, payload: r.encrypted_payload }));
    const decoded = items.length ? await enclave.ledger.decrypt(envelopeKey.key_id, items) : {};
    scope.assertCurrent();
    setDecoded(decoded);
  }
  async function loadMore() {
    const scope = capture();
    const last = rows.at(-1); if (!last) return;
    const extra = await list({ data: { cursor: { id: last.id, createdAt: last.created_at } } }) as unknown as LogRow[];
    scope.assertCurrent();
    setRows((current) => [...current, ...extra]);
    if (unlockedKeyId) {
      const items = extra.filter((r) => r.key_id === unlockedKeyId).map((r) => ({ id: r.id, payload: r.encrypted_payload }));
      if (items.length) {
        const more = await enclave.ledger.decrypt(unlockedKeyId, items);
        scope.assertCurrent();
        setDecoded((current) => ({ ...current, ...more }));
      }
    }
  }
  function lock() {
    invalidate();
    setBusy(false);
    void enclave.ledger.lock().catch(() => undefined);
    setUnlockedKeyId(null); setDecoded({});
  }
  return <section className="space-y-5 border-t border-border py-5">
    <h2 className="flex items-center gap-2 text-lg font-medium"><LockKeyhole aria-hidden="true" className="size-5" />Inlog- &amp; Activiteitsgeschiedenis</h2>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!pending && <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={usePrf} onCheckedChange={(v) => setUsePrf(v === true)} />Passkey PRF toevoegen</label>
      <Button variant="outline" disabled={busy} onClick={() => void run(prepare)}><RefreshCw aria-hidden="true" className="size-4" />{active ? "Nieuwe logboeksleutel" : "Versleuteld logboek activeren"}</Button>
    </div>}
    {pending && <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Bewaar deze herstelcode. Sleutelverlies raakt alleen je historische logboek, nooit je account, profielen of domeinen.</p>
      <code className="block break-all rounded-md border border-border bg-muted p-3 text-sm">{pending.recoveryCode}</code>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(v === true)} />Ik heb de herstelcode veilig opgeslagen.</label>
      <div className="flex gap-2"><Button disabled={busy || !acknowledged} onClick={() => void run(activate)}>Sleutel activeren</Button><Button variant="ghost" onClick={cancelPending}>Annuleren</Button></div>
    </div>}
    {keys.length > 0 && <div className="flex flex-wrap gap-2">
      <select aria-label="Logboeksleutel" value={selectedKeyId || active?.key_id || ""} onChange={(e) => setSelectedKeyId(e.target.value)} className="rounded-md border border-border bg-background px-3 text-sm">
        {keys.map((k, index) => <option key={k.key_id} value={k.key_id}>{k.retired_at ? `Historische sleutel ${index + 1}` : "Actieve sleutel"}</option>)}
      </select>
      <Input aria-label="Logboekherstelcode" type="password" autoComplete="off" value={recovery} onChange={(e) => setRecovery(e.target.value)} placeholder="ROUT-RCVR-…" className="max-w-md" />
      <Button disabled={busy || !recovery} onClick={() => void run(() => unlock(false))}>Lokaal ontsleutelen</Button>
      {active?.encrypted_ledger_private_key.some((e) => e.source === "prf") && <Button variant="outline" disabled={busy} onClick={() => void run(() => unlock(true))}><Fingerprint aria-hidden="true" className="size-4" />Passkey</Button>}
      {unlockedKeyId && <Button variant="ghost" onClick={lock}>Vergrendelen</Button>}
    </div>}
    <ul className="divide-y divide-border">{rows.map((row) => <li key={row.id} className="py-3"><time className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString("nl-BE")}</time><p className="break-all text-sm">{decoded[row.id] ?? "Versleutelde activiteit · vergrendeld"}</p></li>)}</ul>
    {!rows.length && <p className="text-sm text-muted-foreground">Nog geen versleutelde activiteiten.</p>}
    {rows.length >= 50 && <Button variant="outline" disabled={busy} onClick={() => void run(loadMore)}>Meer activiteiten</Button>}
    <h3 className="text-lg font-medium">Auditlog</h3>
    <p role="status" className="flex items-center gap-2 text-sm">{integrity?.verified ? <><ShieldCheck aria-hidden="true" className="size-5 text-primary" />Cryptografisch geverifieerd</> : "Geen volledige cryptografische verificatie beschikbaar"}</p>
    {integrity?.merkleRoot && <code className="block break-all text-xs text-muted-foreground">Merkle root: {integrity.merkleRoot}</code>}
    <ul className="divide-y divide-border">{integrity?.rows.map((row) => <li key={row.id} className="py-2 text-sm">{row.clientId} · {row.scopes.join(", ")}<time className="block text-xs text-muted-foreground">{new Date(row.timestamp).toLocaleString("nl-BE")}</time></li>)}</ul>
  </section>;
}