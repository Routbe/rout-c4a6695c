import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { useCryptoLifecycle } from "@/hooks/useCryptoLifecycle";
import { captureEnclaveScope, enclave, EnclaveError, type SealedForUser, type VaultSummary } from "@/lib/crypto-enclave/client";
import { openEphemeralVault } from "@/lib/vault/ephemeral-vault.functions";

type Props = { vaultId: string; secret: string; onCancel: () => void };
type Opened = { handle: string; summary: VaultSummary; claimProof: string; expiresAt: string };

/**
 * Zero-knowledge claim of an AI handoff vault. All cryptography runs in the
 * cryptographic enclave worker: it derives the claim proof, decrypts the vault
 * and re-encrypts it with the member's device key. This component only ever
 * holds public metadata, handles and ciphertext, plus user-entered/displayed
 * recovery material. Browser strings and WebAuthn are not an XSS enclave.
 */
export function VaultClaim(props: Props) {
  const { user } = useAuth();
  return <VaultClaimSession key={`${user?.id ?? "signed-out"}:${props.vaultId}:${props.secret}`} {...props} />;
}

function VaultClaimSession({ vaultId, secret, onCancel }: Props) {
  const { user } = useAuth();
  const { capture } = useCryptoLifecycle();
  const openVault = useServerFn(openEphemeralVault);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [deviceKeyId, setDeviceKeyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [phrase, setPhrase] = useState("");
  const [fresh, setFresh] = useState<{ handle: string; mnemonic: string } | null>(null);
  const [wroteDown, setWroteDown] = useState(false);
  const [done, setDone] = useState<{ slug: string } | null>(null);
  // Ciphertext kept for a retry after a network error; never plaintext.
  const sealedRef = useRef<{ ownerId: string; vaultId: string; sealed: SealedForUser } | null>(null);
  const operation = useRef(false);
  const freshRef = useRef<string | null>(null);
  freshRef.current = fresh?.handle ?? null;

  // Step A + B: the enclave derives the claim proof, we fetch ciphertext, the enclave decrypts.
  useEffect(() => {
    let cancelled = false;
    let handle: string | null = null;
    let retained = false;
    const workerScope = captureEnclaveScope();
    const discard = (id: string) => {
      try { workerScope.assertCurrent(); } catch { return; }
      void enclave.vault.discard(id).catch(() => undefined);
    };
    (async () => {
      try {
        const prepared = await enclave.vault.prepare(secret);
        handle = prepared.handle;
        if (cancelled) {
          discard(prepared.handle);
          return;
        }
        const res = await openVault({ data: { vaultId, claimProof: prepared.claimProof } });
        if (cancelled) return;
        if (res.status === "not_found") return setError("Deze overdracht bestaat niet (meer). Kluizen vernietigen zichzelf na 1 uur.");
        if (res.status === "invalid") return setError("Deze code past niet bij de kluis. Controleer elk teken.");
        const summary = await enclave.vault.decrypt(prepared.handle, vaultId, res.encryptedPayload, res.expiresAt);
        if (!cancelled) {
          retained = true;
          setOpened({ handle: prepared.handle, summary, claimProof: prepared.claimProof, expiresAt: res.expiresAt });
        }
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof EnclaveError && e.code === "enclave_unavailable"
            ? "Je browser blokkeert de beveiligde versleutelingsomgeving. Probeer een recente browser."
            : "Openen mislukt. Probeer het zo opnieuw.",
        );
      } finally {
        if (handle && !retained) discard(handle);
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      if (handle) discard(handle);
    };
  }, [vaultId, secret, openVault]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void enclave.deviceKey
      .status(user.id)
      .then((k) => { if (!cancelled) setDeviceKeyId(k?.keyId ?? null); })
      .catch(() => { if (!cancelled) setDeviceKeyId(null); });
    return () => { cancelled = true; };
  }, [user]);

  // A generated-but-unused Master Key is wiped in the enclave when we leave.
  useEffect(() => {
    const workerScope = captureEnclaveScope();
    return () => {
      try { workerScope.assertCurrent(); } catch { return; }
      if (freshRef.current) void enclave.masterKey.discardPending(freshRef.current).catch(() => undefined);
    };
  }, []);

  async function unlockFromPhrase() {
    if (!user) return;
    const scope = capture();
    setError(null);
    try {
      const { keyId } = await enclave.masterKey.unlock(user.id, phrase);
      scope.assertCurrent();
      setPhrase("");
      setDeviceKeyId(keyId);
    } catch {
      if (!scope.isUiCurrent()) return;
      setError("Ongeldige Master Key. Controleer de 24 woorden.");
    }
  }

  async function confirmFresh() {
    if (!user || !fresh) return;
    const scope = capture();
    setError(null);
    try {
      const { keyId } = await enclave.masterKey.commitPending(fresh.handle, user.id);
      scope.assertCurrent();
      setFresh(null);
      setDeviceKeyId(keyId);
    } catch {
      if (!scope.isUiCurrent()) return;
      setFresh(null);
      setError("Deze Master Key is verlopen. Maak een nieuwe aan.");
    }
  }

  async function makeFresh() {
    if (operation.current) return;
    operation.current = true;
    const scope = capture();
    setError(null);
    try {
      const generated = await enclave.masterKey.generate();
      if (!scope.isCurrent()) {
        void enclave.masterKey.discardPending(generated.handle).catch(() => undefined);
        return;
      }
      if (freshRef.current) void enclave.masterKey.discardPending(freshRef.current).catch(() => undefined);
      freshRef.current = generated.handle;
      setFresh(generated);
      setWroteDown(false);
    } catch {
      if (!scope.isUiCurrent()) return;
      setError("Kon geen Master Key maken. Probeer opnieuw.");
    } finally {
      operation.current = false;
    }
  }

  // Step C + commit: the enclave re-encrypts with the member's key; only ciphertext is sent.
  async function commit() {
    if (!user || !opened || !deviceKeyId || operation.current) return;
    operation.current = true;
    const scope = capture();
    setBusy(true);
    setError(null);
    try {
      const cached = sealedRef.current;
      const sealed = cached?.ownerId === user.id && cached.vaultId === vaultId ? cached.sealed : await enclave.vault.reseal(opened.handle, user.id);
      scope.assertCurrent();
      sealedRef.current = { ownerId: user.id, vaultId, sealed };
      const res = await fetch("/api/v1/workspaces/commit", {
        method: "POST",
        credentials: "same-origin",
        signal: scope.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vault_id: vaultId,
          claim_proof: opened.claimProof,
          name: opened.summary.name,
          ...(opened.summary.slug ? { slug_base: opened.summary.slug } : {}),
          encrypted_config: sealed.encrypted,
          key_id: sealed.keyId,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { slug?: string; error?: string };
      scope.assertCurrent();
      if (!res.ok || !body.slug) {
        setError(
          body.error === "vault_not_found" ? "Deze overdracht is verlopen of al geclaimd."
          : body.error === "vault_proof_invalid" ? "Deze code past niet bij de kluis."
          : body.error === "unauthorized" ? "Log opnieuw in en probeer het nog eens."
          : "Claimen mislukt. Probeer opnieuw.",
        );
        return;
      }
      sealedRef.current = null;
      setOpened(null);
      setDone({ slug: body.slug });
    } catch (e) {
      if (!scope.isUiCurrent()) return;
      setError(
        e instanceof EnclaveError && e.code === "no_device_key" ? "Ontgrendel eerst je Master Key."
        : e instanceof EnclaveError && e.code === "unknown_handle" ? "De kluis is verlopen in deze browser. Open de link opnieuw."
        : "Claimen mislukt. Probeer opnieuw.",
      );
    } finally {
      operation.current = false;
      if (scope.isUiCurrent()) setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="flex flex-col items-center gap-5 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-full border-2 border-accent/60">
          <Check className="h-10 w-10 text-accent" aria-hidden />
        </div>
        <h2 className="font-display text-3xl">Workspace geclaimd!</h2>
        <p className="text-muted-foreground">De configuratie staat versleuteld met jouw eigen sleutel. De tijdelijke kluis is vernietigd.</p>
        <Button asChild>
          <Link to="/w/$slug" params={{ slug: done.slug }}>Open je workspace</Link>
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-xl border border-border p-5">
      <header className="flex items-center gap-2">
        <Lock className="h-5 w-5 text-primary" aria-hidden />
        <h2 className="font-display text-2xl">Versleutelde overdracht</h2>
      </header>

      {busy && !opened && !error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Kluis lokaal ontsleutelen…
        </p>
      )}

      {opened && (
        <div className="space-y-1">
          <p className="text-lg font-medium">{opened.summary.name}</p>
          {opened.summary.description && <p className="text-sm text-muted-foreground">{opened.summary.description}</p>}
          <p className="text-xs text-muted-foreground">
            Lokaal ontsleuteld in je browser. Kluis vernietigt zichzelf om {new Date(opened.expiresAt).toLocaleTimeString("nl-NL")}.
          </p>
        </div>
      )}

      {opened && !deviceKeyId && (
        <div className="space-y-3 rounded-lg bg-muted p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4" aria-hidden /> Ontgrendel je Master Key
          </p>
          {fresh ? (
            <>
              <p className="text-xs text-muted-foreground">Schrijf deze 24 woorden op papier. ROUT bewaart ze niet en kan ze nooit herstellen.</p>
              <p className="rounded-md border border-border bg-background p-3 font-mono text-sm leading-relaxed">{fresh.mnemonic}</p>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={wroteDown} onCheckedChange={(v) => setWroteDown(v === true)} /> Ik heb ze veilig opgeschreven
              </label>
              <Button className="w-full" disabled={!wroteDown} onClick={() => void confirmFresh()}>
                Gebruik deze Master Key
              </Button>
            </>
          ) : (
            <>
              <Textarea
                aria-label="Master Key (24 woorden)"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder="24 woorden, gescheiden door spaties"
                autoComplete="off"
                spellCheck={false}
                rows={3}
                className="font-mono"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void unlockFromPhrase()} disabled={!phrase.trim()}>Ontgrendelen</Button>
                <Button variant="outline" onClick={() => void makeFresh()}>Nieuwe Master Key maken</Button>
              </div>
            </>
          )}
          <p className="text-xs text-muted-foreground">De sleutel blijft op dit apparaat (niet-exporteerbaar) en gaat nooit naar de server of de AI.</p>
        </div>
      )}

      {error && <p role="alert" className="rounded-lg bg-muted px-4 py-2 text-sm">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={busy && !!opened}>Annuleren</Button>
        <Button onClick={() => void commit()} disabled={!opened || !deviceKeyId || busy}>
          {busy && opened && <Loader2 className="animate-spin" aria-hidden />}
          Versleutelen en claimen
        </Button>
      </div>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Alleen versleutelde gegevens verlaten je browser.
      </p>
    </section>
  );
}
