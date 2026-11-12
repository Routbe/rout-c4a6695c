import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import {
  Camera, Check, Copy, FileText, Fingerprint, KeyRound, Laptop, Nfc, Printer, RotateCcw, ShieldAlert, ShieldCheck, Trash2, UserRound, X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCryptoLifecycle } from "@/hooks/useCryptoLifecycle";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { withStepUp } from "@/components/auth/StepUpDialog";
import { enclave, EnclaveError } from "@/lib/crypto-enclave/client";
import type { RecoveryVault, ShardCheck } from "@/lib/recovery/vault";
import {
  beginRecovery, deleteRecoveryVault, finishRecovery, getRecoveryStatus, saveRecoveryVault, saveSealedShard,
} from "@/lib/recovery/recovery.functions";
import { MAX_SERVER_SHARDS, canGeneratePhrase, missingShards, slotsReady, type SlotKind } from "@/lib/recovery/vault-rules";
import { RecoveryPhraseKit } from "./RecoveryPhraseKit";

type Status = Awaited<ReturnType<typeof getRecoveryStatus>>;
type Slot = { index: number; shard: string; kind: SlotKind; done: boolean; sealed?: { credential: string; ciphertext: string } };
type Entered = { index: number; text: string; check: ShardCheck };

const KIND: Record<SlotKind, { label: string; hint: string; Icon: typeof FileText }> = {
  paper: { label: "Papier", hint: "Afdrukbaar herstelvel met QR-code. Bewaar het op een droge, veilige plek.", Icon: FileText },
  nfc: { label: "NFC-kaart", hint: "Beschrijf een lege NFC-sticker of -kaart. Werkt in Chrome op Android.", Icon: Nfc },
  contact: { label: "Vertrouwd contact", hint: "Geef deze scherf aan iemand die je vertrouwt, bijvoorbeeld afgedrukt. Eén scherf alleen verraadt niets.", Icon: UserRound },
  passkey: { label: "Passkey", hint: "Versleuteld met je passkey en bewaard bij ROUT. Alleen jouw passkey kan hem openen.", Icon: Fingerprint },
  device: { label: "Tweede toestel", hint: "Scan de QR-code met je tweede toestel en bewaar de tekst in de notities of wachtwoordmanager daar.", Icon: Laptop },
};

const OUTCOME: Record<string, string> = {
  created: "Kluis gemaakt", rotated: "Scherven vernieuwd", started: "Herstel gestart", restored: "Hoofdsleutel hersteld",
  failed: "Herstel mislukt", practice: "Oefenherstel",
};

function message(e: unknown): string {
  if (e instanceof EnclaveError) {
    if (e.code === "invalid_mnemonic") return "Deze herstelwoorden kloppen niet. Controleer elk woord.";
    if (e.code === "decrypt_failed") return "Deze scherven openen de kluis niet. Controleer of ze bij deze kluis horen.";
    if (e.code === "enclave_unavailable") return "Je browser blokkeert de beveiligde rekenmodule.";
    return "Er ging iets mis in de beveiligde rekenmodule. Probeer opnieuw.";
  }
  if (e instanceof Error && e.message === "prf_unsupported") return "Deze passkey kan geen scherf beveiligen. Kies een andere bewaarplaats of een nieuwere passkey.";
  if (e instanceof Error && /NotAllowed|abort/i.test(e.name + e.message)) return "Geannuleerd.";
  return e instanceof Error ? e.message : "Er ging iets mis.";
}

const hasNfc = () => typeof window !== "undefined" && "NDEFReader" in window;
type NdefReader = { write: (m: unknown) => Promise<void>; scan: (o?: { signal?: AbortSignal }) => Promise<void>; onreading: ((e: { message: { records: { recordType: string; data?: DataView }[] } }) => void) | null };
const newReader = () => new (window as unknown as { NDEFReader: new () => NdefReader }).NDEFReader();

/**
 * Herstelkluis: the Master Key is restorable from any 3 of 5 shards. Splitting,
 * checking and joining happen in the crypto enclave worker; this component
 * only holds the printable shard strings the member must hand out.
 */
export function RecoveryVaultPanel() {
  const { user } = useAuth();
  return user ? <RecoveryVaultSession key={user.id} userId={user.id} /> : null;
}

function RecoveryVaultSession({ userId }: { userId: string }) {
  const status = useServerFn(getRecoveryStatus);
  const [state, setState] = useState<Status | null>(null);
  const [mode, setMode] = useState<"idle" | "create" | "restore" | "practice">("idle");
  const [error, setError] = useState<string | null>(null);
  const refresh = () => status().then(setState).catch(() => setError("Herstelkluis is nu niet bereikbaar."));
  useEffect(() => { void refresh(); }, []);

  return (
    <section id="herstelkluis" aria-labelledby="herstelkluis-title" className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="space-y-1">
        <h2 id="herstelkluis-title" className="flex items-center gap-2 text-lg font-medium"><KeyRound className="size-4" /> Herstelkluis · 3 van 5</h2>
        <p className="text-sm text-muted-foreground">
          Je hoofdsleutel wordt in 5 scherven verdeeld. Met 3 scherven krijg je hem terug, met 1 of 2 weet niemand iets. ROUT bewaart er nooit meer dan 2, dus ook ROUT kan nooit alleen herstellen.
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {mode === "idle" && state && <Overview state={state} onCreate={() => setMode("create")} onRestore={(p) => setMode(p ? "practice" : "restore")} onChanged={refresh} />}
      {mode === "create" && <CreateVault userId={userId} rotating={!!state?.vault} onDone={() => { setMode("idle"); void refresh(); }} />}
      {(mode === "restore" || mode === "practice") && <RestoreVault userId={userId} practice={mode === "practice"} onDone={() => { setMode("idle"); void refresh(); }} />}
    </section>
  );
}

function Overview({ state, onCreate, onRestore, onChanged }: { state: Status; onCreate: () => void; onRestore: (practice: boolean) => void; onChanged: () => void }) {
  const remove = useServerFn(deleteRecoveryVault);
  const [confirm, setConfirm] = useState(false);
  if (!state.vault) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">Nog geen herstelkluis. Heb je nog geen herstelwoorden, dan maken we ze hier automatisch voor je.</p>
        <Button onClick={onCreate} className="w-full sm:w-auto"><KeyRound /> Herstelkluis maken</Button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-2" aria-label="Scherven">
        {[1, 2, 3, 4, 5].map((i) => {
          const server = state.serverSlots.includes(i);
          return (
            <div key={i} data-tactile className="flex aspect-square min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-background p-1 text-center">
              {server ? <Fingerprint className="size-4" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
              <span className="text-[11px] font-medium leading-tight">{i}</span>
              <span className="w-full truncate text-[10px] leading-tight text-muted-foreground">{server ? "Passkey" : "Bij jou"}</span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Gemaakt op {new Date(state.vault.createdAt).toLocaleString("nl-BE")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="soft" onClick={() => onRestore(true)}><RotateCcw /> Oefenherstel</Button>
        <Button onClick={() => onRestore(false)}><KeyRound /> Hoofdsleutel herstellen</Button>
        <Button variant="soft" onClick={onCreate}><RotateCcw /> Scherven vernieuwen</Button>
        {!confirm ? (
          <Button variant="ghost" onClick={() => setConfirm(true)}><Trash2 /> Kluis verwijderen</Button>
        ) : (
          <Button variant="destructive" onClick={async () => {
            try { await withStepUp(() => remove()); toast.success("Herstelkluis verwijderd. Je scherven werken niet meer."); onChanged(); }
            catch (e) { toast.error(message(e)); } finally { setConfirm(false); }
          }}><Trash2 /> Echt verwijderen</Button>
        )}
      </div>
      {state.attempts.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Laatste gebeurtenissen</h3>
          <ul className="divide-y divide-border text-sm">
            {state.attempts.slice(0, 6).map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                <span>{OUTCOME[a.outcome] ?? a.outcome}</span>
                <time className="shrink-0 text-xs text-muted-foreground">{new Date(a.at).toLocaleString("nl-BE")}</time>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---- Create / rotate ---------------------------------------------------------

const DEFAULT_KINDS: SlotKind[] = ["paper", "nfc", "contact", "passkey", "device"];

function CreateVault({ userId, rotating, onDone }: { userId: string; rotating: boolean; onDone: () => void }) {
  const { capture } = useCryptoLifecycle();
  const save = useServerFn(saveRecoveryVault);
  const saveShard = useServerFn(saveSealedShard);
  const [words, setWords] = useState("");
  const [vault, setVault] = useState<RecoveryVault | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [open, setOpen] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<Slot | null>(null);
  const [ack, setAck] = useState(false);
  const serverCount = slots.filter((s) => s.kind === "passkey").length;
  // Automatic 24-word phrase: only on a device without a Master Key (see canGeneratePhrase).
  const [deviceHasKey, setDeviceHasKey] = useState<boolean | null>(null);
  const [manual, setManual] = useState(false);
  const [generated, setGenerated] = useState<{ handle: string; mnemonic: string } | null>(null);
  const [phraseOk, setPhraseOk] = useState(false);
  const pending = useRef<string | null>(null);
  useEffect(() => {
    let live = true;
    enclave.deviceKey.status(userId).then((k) => { if (live) setDeviceHasKey(Boolean(k)); }).catch(() => { if (live) setDeviceHasKey(null); });
    return () => {
      live = false;
      // A phrase that was shown but never confirmed must not linger in the worker.
      if (pending.current) void enclave.masterKey.discardPending(pending.current).catch(() => undefined);
    };
  }, [userId]);
  const mayGenerate = canGeneratePhrase({ deviceHasKey, hasVault: rotating });

  async function generate() {
    const scope = capture();
    setBusy(true); setError(null);
    try {
      const r = await enclave.masterKey.generate();
      scope.assertCurrent();
      pending.current = r.handle;
      setGenerated(r);
    } catch (e) { if (scope.isUiCurrent()) setError(message(e)); } finally { if (scope.isUiCurrent()) setBusy(false); }
  }

  async function continueWithGenerated() {
    if (!generated) return;
    const scope = capture();
    setBusy(true); setError(null);
    try {
      await enclave.masterKey.commitPending(generated.handle, userId);
      pending.current = null;
      const r = await enclave.recovery.create(generated.mnemonic);
      scope.assertCurrent();
      setGenerated(null); setPhraseOk(false); setDeviceHasKey(true);
      setVault(r.vault);
      setSlots(r.shards.map((shard, i) => ({ index: i + 1, shard, kind: DEFAULT_KINDS[i] ?? "paper", done: false })));
    } catch (e) { if (scope.isUiCurrent()) setError(message(e)); } finally { if (scope.isUiCurrent()) setBusy(false); }
  }

  async function split() {
    const scope = capture();
    setBusy(true); setError(null);
    try {
      const r = await enclave.recovery.create(words);
      scope.assertCurrent();
      setWords("");
      setVault(r.vault);
      setSlots(r.shards.map((shard, i) => ({ index: i + 1, shard, kind: DEFAULT_KINDS[i] ?? "paper", done: false })));
    } catch (e) { if (scope.isUiCurrent()) setError(message(e)); } finally { if (scope.isUiCurrent()) setBusy(false); }
  }

  const update = (index: number, patch: Partial<Slot>) => setSlots((all) => all.map((s) => (s.index === index ? { ...s, ...patch } : s)));
  const markDone = (index: number) => { update(index, { done: true }); setOpen(index + 1); };

  async function sealWithPasskey(slot: Slot) {
    if (!vault) return;
    setBusy(true); setError(null);
    try {
      const { withPasskeyPrf } = await import("@/lib/recovery/passkey-prf");
      const sealed = await withPasskeyPrf("shard", async (output, credential) => ({ credential, ciphertext: (await enclave.recovery.sealShard(output, slot.shard, vault.vaultId)).blob }));
      update(slot.index, { sealed, done: true });
      setOpen(slot.index + 1);
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }

  async function writeNfc(slot: Slot) {
    setBusy(true); setError(null);
    try {
      await newReader().write({ records: [{ recordType: "text", data: slot.shard }] });
      toast.success(`Scherf ${slot.index} staat op de NFC-kaart.`);
      markDone(slot.index);
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }

  async function finish() {
    if (!vault) return;
    const scope = capture();
    setBusy(true); setError(null);
    try {
      // Prove before saving that two disjoint-ish 3-of-5 sets reopen the vault.
      const shards = slots.map((s) => s.shard);
      await enclave.recovery.restore(userId, vault, shards.slice(0, 3), true);
      await enclave.recovery.restore(userId, vault, shards.slice(2, 5), true);
      scope.assertCurrent();
      await withStepUp(() => save({ data: { vault } }));
      for (const s of slots) {
        if (s.kind !== "passkey" || !s.sealed) continue;
        const r = await withStepUp(() => saveShard({ data: { vaultId: vault.vaultId, index: s.index, credential: s.sealed!.credential, ciphertext: s.sealed!.ciphertext } }));
        if (!r.ok) throw new Error("ROUT bewaart maximaal 2 scherven. Kies voor de andere een plek bij jou.");
      }
      scope.assertCurrent();
      setSlots([]); setVault(null);
      toast.success(rotating ? "Nieuwe scherven actief. Alle oude scherven werken niet meer." : "Herstelkluis actief.");
      onDone();
    } catch (e) { if (scope.isUiCurrent()) setError(message(e)); } finally { if (scope.isUiCurrent()) setBusy(false); }
  }

  if (!vault && generated) {
    return (
      <div className="space-y-3">
        <RecoveryPhraseKit mnemonic={generated.mnemonic} onConfirmed={setPhraseOk} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button disabled={busy || !phraseOk} onClick={() => void continueWithGenerated()}><KeyRound /> Verder: in 5 scherven verdelen</Button>
          <Button variant="ghost" onClick={() => { if (pending.current) void enclave.masterKey.discardPending(pending.current); pending.current = null; setGenerated(null); onDone(); }}>Annuleren</Button>
        </div>
      </div>
    );
  }

  if (!vault && mayGenerate && !manual) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-background p-3 text-sm">
          <p className="font-medium">Nog geen herstelwoorden op dit toestel</p>
          <p className="mt-1 text-muted-foreground">ROUT maakt nu 24 willekeurige woorden in de beveiligde rekenmodule op dit toestel. Ze worden nooit verstuurd. Daarna kopieer, download of print je ze, en verdelen we je hoofdsleutel in 5 scherven.</p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button disabled={busy} onClick={() => void generate()}><KeyRound /> Maak mijn 24 herstelwoorden</Button>
          <Button variant="soft" onClick={() => setManual(true)}>Ik heb al herstelwoorden</Button>
          <Button variant="ghost" onClick={onDone}>Annuleren</Button>
        </div>
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="space-y-3">
        {rotating && <p className="flex items-start gap-2 rounded-xl border border-border bg-background p-3 text-sm"><ShieldAlert className="mt-0.5 size-4 shrink-0" /> Na vernieuwen werken al je oude scherven niet meer, ook de scherven die je al hebt uitgedeeld.</p>}
        <label htmlFor="recovery-words" className="text-sm font-medium">Je 24 herstelwoorden</label>
        <Textarea id="recovery-words" value={words} onChange={(e) => setWords(e.target.value)} rows={3} autoComplete="off" autoCorrect="off" spellCheck={false} className="font-mono" placeholder="woord1 woord2 woord3 …" />
        <p className="text-xs text-muted-foreground">Ze worden alleen in de beveiligde rekenmodule op dit toestel gebruikt en nooit verstuurd.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button disabled={busy || words.trim().split(/\s+/).length < 12} onClick={() => void split()}><KeyRound /> In 5 scherven verdelen</Button>
          <Button variant="ghost" onClick={onDone}>Annuleren</Button>
        </div>
      </div>
    );
  }

  const ready = slotsReady(slots);
  return (
    <div className="space-y-3">
      <p className="text-sm">Geef elke scherf een eigen bewaarplaats. Zet nooit 3 scherven op dezelfde plek.</p>
      <ol className="space-y-2">
        {slots.map((slot) => {
          const meta = KIND[slot.kind];
          const expanded = open === slot.index && !slot.done;
          return (
            <li key={slot.index} className="rounded-xl border border-border bg-background">
              <button type="button" data-tactile onClick={() => setOpen(expanded ? 0 : slot.index)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left">
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg border border-border ${slot.done ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                  {slot.done ? <Check className="size-4" /> : <meta.Icon className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Scherf {slot.index} · {meta.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{slot.done ? "Opgeslagen" : meta.hint}</span>
                </span>
              </button>
              {expanded && (
                <div className="space-y-3 border-t border-border p-3">
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Bewaarplaats scherf ${slot.index}`}>
                    {(Object.keys(KIND) as SlotKind[]).map((k) => {
                      const blocked = k === "passkey" && slot.kind !== "passkey" && serverCount >= MAX_SERVER_SHARDS;
                      return (
                        <Button key={k} size="sm" variant={slot.kind === k ? "default" : "soft"} role="radio" aria-checked={slot.kind === k} disabled={blocked}
                          onClick={() => update(slot.index, { kind: k, sealed: undefined })}>
                          {KIND[k].label}
                        </Button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">{meta.hint}</p>
                  {slot.kind !== "passkey" && (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-start">
                      <div className="rounded-lg bg-background p-2"><QRCodeSVG value={slot.shard} size={132} level="M" bgColor="transparent" fgColor="currentColor" /></div>
                      <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed">{slot.shard}</code>
                    </div>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {(slot.kind === "paper" || slot.kind === "contact") && <Button variant="soft" onClick={() => setPrinting(slot)}><Printer /> Herstelvel afdrukken</Button>}
                    {slot.kind === "nfc" && <Button variant="soft" disabled={busy || !hasNfc()} onClick={() => void writeNfc(slot)}><Nfc /> {hasNfc() ? "Op NFC-kaart zetten" : "NFC niet beschikbaar in deze browser"}</Button>}
                    {slot.kind === "passkey" && <Button disabled={busy} onClick={() => void sealWithPasskey(slot)}><Fingerprint /> Beveiligen met passkey</Button>}
                    {slot.kind !== "passkey" && <Button variant="soft" onClick={() => { void navigator.clipboard.writeText(slot.shard); toast.success("Scherf gekopieerd"); }}><Copy /> Kopiëren</Button>}
                    {slot.kind !== "passkey" && slot.kind !== "nfc" && <Button onClick={() => markDone(slot.index)}><Check /> Opgeslagen</Button>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <label className="flex items-start gap-2 text-sm"><Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" /> Ik heb de 5 scherven op verschillende plekken bewaard.</label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button disabled={busy || !ready || !ack} onClick={() => void finish()}><ShieldCheck /> Kluis activeren</Button>
        <Button variant="ghost" onClick={() => { setSlots([]); setVault(null); onDone(); }}>Annuleren</Button>
      </div>
      {printing && <PrintSheet slot={printing} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function PrintSheet({ slot, onClose }: { slot: Slot; onClose: () => void }) {
  useEffect(() => {
    document.documentElement.dataset.printing = "recovery";
    const t = setTimeout(() => window.print(), 150);
    const after = () => onClose();
    window.addEventListener("afterprint", after);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", after); delete document.documentElement.dataset.printing; };
  }, [onClose]);
  return (
    <div data-print-sheet className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6 print:static print:block">
      <div className="w-full max-w-md space-y-4 text-center">
        <p className="text-xs font-medium tracking-[0.2em] uppercase">ROUT · Herstelscherf {slot.index} van 5</p>
        <div className="mx-auto w-fit rounded-xl border border-border p-4"><QRCodeSVG value={slot.shard} size={220} level="M" /></div>
        <code className="block break-all font-mono text-sm leading-relaxed">{slot.shard}</code>
        <p className="text-xs">Deze scherf alleen opent niets. Met 3 van de 5 scherven herstelt de eigenaar zijn ROUT-hoofdsleutel via Account & Beveiliging → Herstelkluis.</p>
        <Button variant="soft" className="print:hidden" onClick={onClose}><X /> Sluiten</Button>
      </div>
    </div>
  );
}

// ---- Restore / practice --------------------------------------------------------

function RestoreVault({ userId, practice, onDone }: { userId: string; practice: boolean; onDone: () => void }) {
  const { capture } = useCryptoLifecycle();
  const begin = useServerFn(beginRecovery);
  const finish = useServerFn(finishRecovery);
  const [vault, setVault] = useState<RecoveryVault | null>(null);
  const [sealed, setSealed] = useState<{ index: number; credential: string; ciphertext: string }[]>([]);
  const [entered, setEntered] = useState<Entered[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void begin({ data: { practice } }).then((r) => {
      if (!r.ok) { setError(r.error === "rate_limited" ? "Te veel herstelpogingen. Probeer het over een uur opnieuw." : "Er is nog geen herstelkluis."); return; }
      setVault(r.vault as RecoveryVault);
      setSealed(r.sealedShards);
    }).catch(() => setError("Herstelkluis is nu niet bereikbaar."));
  }, [begin, practice]);

  const valid = useMemo(() => entered.filter((e) => e.check.ok), [entered]);
  const need = vault ? missingShards(valid.map((e) => e.index), vault.threshold) : 3;

  async function add(raw: string) {
    if (!vault) return;
    const shard = raw.trim();
    if (!shard) return;
    const scope = capture();
    setError(null);
    try {
      const check = await enclave.recovery.check(vault, shard);
      scope.assertCurrent();
      if (check.ok && entered.some((e) => e.check.ok && e.index === check.index)) { setError(`Scherf ${check.index} heb je al toegevoegd.`); return; }
      setEntered((all) => [...all, { index: check.index, text: shard, check }]);
      setText("");
      if (check.ok) navigator.vibrate?.(10);
    } catch (e) { setError(message(e)); }
  }

  async function fromPasskey(s: { index: number; credential: string; ciphertext: string }) {
    if (!vault) return;
    setBusy(true); setError(null);
    try {
      const { withPasskeyPrf } = await import("@/lib/recovery/passkey-prf");
      const shard = await withPasskeyPrf("shard", async (output) => (await enclave.recovery.openShard(output, s.ciphertext, vault.vaultId)).shard, s.credential);
      await add(shard);
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }

  async function fromNfc() {
    setBusy(true); setError(null);
    const ctrl = new AbortController();
    const stop = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const reader = newReader();
      reader.onreading = (e) => {
        const rec = e.message.records.find((r) => r.recordType === "text" && r.data);
        if (!rec?.data) return;
        ctrl.abort();
        void add(new TextDecoder().decode(rec.data));
        setBusy(false);
      };
      await reader.scan({ signal: ctrl.signal });
      toast("Houd de NFC-kaart tegen je toestel.");
    } catch (e) { setError(message(e)); setBusy(false); }
    ctrl.signal.addEventListener("abort", () => { clearTimeout(stop); setBusy(false); }, { once: true });
  }

  async function restore() {
    if (!vault) return;
    const scope = capture();
    setBusy(true); setError(null);
    try {
      await enclave.recovery.restore(userId, vault, valid.map((e) => e.text), practice);
      scope.assertCurrent();
      if (!practice) await finish({ data: { outcome: "restored" } });
      toast.success(practice ? "Oefenherstel geslaagd. Er is niets gewijzigd." : "Je hoofdsleutel staat weer op dit toestel.");
      setEntered([]);
      onDone();
    } catch (e) {
      if (!practice) void finish({ data: { outcome: "failed" } }).catch(() => undefined);
      if (scope.isUiCurrent()) setError(message(e));
    } finally { if (scope.isUiCurrent()) setBusy(false); }
  }

  const reason = (c: ShardCheck) => c.reason === "wrong_vault" ? "hoort bij een andere of oude kluis" : c.reason === "forged" ? "is vervalst of beschadigd" : "is onleesbaar";
  const usedPasskey = new Set(valid.map((e) => e.index));

  return (
    <div className="space-y-4">
      <p className="text-sm">{practice ? "Oefenherstel: je test je scherven zonder iets te veranderen." : "Voeg 3 scherven toe om je hoofdsleutel op dit toestel terug te zetten."} Je krijgt van elke poging een e-mail.</p>
      <div className="grid grid-cols-5 gap-2" aria-live="polite">
        {[1, 2, 3, 4, 5].map((i) => {
          const ok = usedPasskey.has(i);
          return (
            <div key={i} data-tactile className={`flex aspect-square min-w-0 flex-col items-center justify-center gap-1 rounded-xl border p-1 ${ok ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}>
              {ok ? <Check className="size-4" /> : <KeyRound className="size-4" />}
              <span className="text-[11px] font-medium">{i}</span>
            </div>
          );
        })}
      </div>
      <p className="text-sm font-medium">{need === 0 ? "Genoeg scherven. Je kunt herstellen." : need === 1 ? "Nog 1 scherf nodig." : `Nog ${need} scherven nodig.`}</p>

      {vault && (
        <div className="space-y-2">
          {sealed.filter((s) => !usedPasskey.has(s.index)).map((s) => (
            <Button key={s.index} variant="soft" className="w-full sm:w-auto" disabled={busy} onClick={() => void fromPasskey(s)}><Fingerprint /> Scherf {s.index} openen met passkey</Button>
          ))}
          <label htmlFor="shard-input" className="block text-sm font-medium">Scherf typen of plakken</label>
          <Textarea id="shard-input" rows={2} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCorrect="off" spellCheck={false} className="font-mono text-xs" placeholder="RS1-…" />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button disabled={!text.trim()} onClick={() => void add(text)}><Check /> Scherf toevoegen</Button>
            <QrScanButton active={scanning} setActive={setScanning} onCode={(c) => void add(c)} />
            {hasNfc() && <Button variant="soft" disabled={busy} onClick={() => void fromNfc()}><Nfc /> NFC-kaart lezen</Button>}
          </div>
        </div>
      )}

      {entered.filter((e) => !e.check.ok).length > 0 && (
        <ul className="space-y-1 text-sm">
          {entered.filter((e) => !e.check.ok).map((e, i) => (
            <li key={i} className="flex items-center gap-2 text-destructive"><X className="size-4 shrink-0" /> {e.check.index ? `Scherf ${e.check.index}` : "Deze scherf"} {reason(e.check)}.</li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button disabled={busy || need > 0} onClick={() => void restore()}><ShieldCheck /> {practice ? "Oefenherstel uitvoeren" : "Hoofdsleutel herstellen"}</Button>
        <Button variant="ghost" onClick={() => { setEntered([]); onDone(); }}>Stoppen</Button>
      </div>
    </div>
  );
}

type DetectorCtor = new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

function QrScanButton({ active, setActive, onCode }: { active: boolean; setActive: (v: boolean) => void; onCode: (c: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [supported, setSupported] = useState(false);
  useEffect(() => { setSupported("BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia); }, []);
  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let stop = false;
    const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
    const detector = new Ctor({ formats: ["qr_code"] });
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const v = video.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        while (!stop) {
          const hit = (await detector.detect(v).catch(() => []))[0]?.rawValue;
          if (hit?.startsWith("RS1-")) { stop = true; setActive(false); onCode(hit); break; }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setActive(false);
        toast.error("Geen toegang tot de camera. Typ de scherf in plaats daarvan.");
      }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [active, onCode, setActive]);
  if (!supported) return null;
  return (
    <>
      <Button variant="soft" onClick={() => setActive(!active)}><Camera /> {active ? "Scannen stoppen" : "QR scannen"}</Button>
      {active && <video ref={video} muted playsInline className="aspect-square w-full max-w-xs rounded-xl border border-border object-cover" />}
    </>
  );
}
