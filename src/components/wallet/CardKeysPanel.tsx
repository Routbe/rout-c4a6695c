import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Nfc, Smartphone, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { pairMyPhysicalKey, listMyPhysicalKeys, setMyPhysicalKeyStatus } from "@/lib/wallet/wallet.functions";
import { readHardwareId, pairingTransition, type PairingState } from "@/lib/wallet/card-pairing";
import { useI18n } from "@/lib/i18n";
import { walletDictionary } from "@/lib/wallet/wallet-i18n";

type Keys = Awaited<ReturnType<typeof listMyPhysicalKeys>>;

type NdefReading = { serialNumber: string; message: { records: { recordType: string; data?: DataView; encoding?: string }[] } };
type NdefReaderLike = { scan: (o?: { signal?: AbortSignal }) => Promise<void>; onreading: ((e: NdefReading) => void) | null; onreadingerror: (() => void) | null };

/**
 * Physical ROUT keys: link a chip by tapping it (WebNFC on Android Chrome) or
 * by entering its factory hardware ID. The separate activation code proves
 * possession; the public NDEF tag never contains key material.
 */
export function CardKeysPanel({ space }: { space?: "root" | "alias" }) {
  const list = useServerFn(listMyPhysicalKeys);
  const pair = useServerFn(pairMyPhysicalKey);
  const setStatus = useServerFn(setMyPhysicalKeyStatus);
  const [keys, setKeys] = useState<Keys | null>(null);
  const { locale } = useI18n();
  const text = walletDictionary[locale] ?? walletDictionary.en;
  const [state, setState] = useState<PairingState>("idle");
  const scanController = useRef<AbortController | null>(null);
  const transition = (event: Parameters<typeof pairingTransition>[1]) => setState((previous) => pairingTransition(previous, event));
  const scanning = state === "scanning";
  const [manual, setManual] = useState("");
  const [activation, setActivation] = useState("");
  const pairing = state === "verifying";
  const [nfc, setNfc] = useState(false);

  const refresh = useCallback(() => {
    list().then(setKeys).catch(() => setKeys({ keys: [], available: false }));
  }, [list]);

  useEffect(() => {
    setNfc("NDEFReader" in window);
    refresh();
  }, [refresh]);

  useEffect(() => () => scanController.current?.abort(), []);

  const link = async () => {
    scanController.current?.abort();
    transition("verify");
    try {
      const r = await pair({ data: { space, hardwareId: manual.trim(), activationCode: activation.trim() } });
      if (r.ok) {
        transition("verified");
        navigator.vibrate?.([60, 80, 60]);
        toast.success(text.success);
        setActivation(""); setManual(""); refresh();
      } else { transition("fail"); toast.error(r.error === "unavailable" ? text.unavailable : text.invalid); }
    } catch { transition("fail"); toast.error(text.failed); }
  };

  const scan = async () => {
    const Reader = (window as unknown as { NDEFReader?: new () => NdefReaderLike }).NDEFReader;
    if (!Reader) return;
    scanController.current?.abort();
    const ctrl = new AbortController();
    scanController.current = ctrl;
    transition("scan");
    const stop = setTimeout(() => {
      if (scanController.current !== ctrl) return;
      ctrl.abort(); transition("fail"); toast.error(text.timeout);
    }, 30_000);
    ctrl.signal.addEventListener("abort", () => clearTimeout(stop), { once: true });
    try {
      const reader = new Reader();
      reader.onreading = (e) => {
        if (ctrl.signal.aborted) return;
        let hardwareId: string | null = null;
        for (const rec of e.message.records) {
          if (rec.recordType !== "text" || !rec.data) continue;
          try { hardwareId = readHardwareId(new TextDecoder(rec.encoding || "utf-8").decode(rec.data)); } catch { continue; }
          if (hardwareId) break;
        }
        ctrl.abort();
        if (hardwareId) { setManual(hardwareId); navigator.vibrate?.(40); transition("detected"); }
        else { transition("fail"); toast.error(text.invalidTag); }
      };
      reader.onreadingerror = () => {
        if (ctrl.signal.aborted) return;
        ctrl.abort(); transition("fail"); toast.error(text.readError);
      };
      await reader.scan({ signal: ctrl.signal });
    } catch {
      if (ctrl.signal.aborted) return;
      ctrl.abort(); transition("fail"); toast.error(text.denied);
    }
  };

  const change = async (hardwareId: string, status: "active" | "frozen" | "revoked") => {
    if (status === "revoked" && !window.confirm(text.revokeConfirm)) return;
    const r = await setStatus({ data: { hardwareId, status } }).catch(() => ({ ok: false }));
    if (!r.ok) toast.error(status === "active" ? text.activateError : text.updateError);
    refresh();
  };

  return (
    <section className="grid gap-3 border-t border-border py-3" aria-labelledby="rout-keys-title">
      <div className="flex items-center justify-between gap-2">
        <h3 id="rout-keys-title" className="flex items-center gap-1.5 text-sm font-semibold"><Nfc className="h-4 w-4" aria-hidden /> {text.title}</h3>
        {nfc && (
          <Button type="button" size="sm" variant="outline" onClick={() => void scan()} disabled={scanning || pairing || keys?.available === false}>
            {scanning ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {text.hold}</> : text.scan}
          </Button>
        )}
      </div>
      {scanning && <div className="grid justify-items-center gap-3 border-y border-border py-5" role="status">
        <div className="relative h-20 w-24 motion-safe:animate-pulse text-primary" aria-hidden="true">
          <Smartphone className="absolute left-1 top-0 h-20 w-12" /><CreditCard className="absolute right-0 top-8 h-9 w-14 -rotate-12" />
        </div>
        <p className="text-center text-sm">{text.hold}</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => { scanController.current?.abort(); transition("cancel"); }}>{text.cancel}</Button>
      </div>}
      {manual && state === "idle" && <p role="status" className="text-xs text-muted-foreground">{text.detected}</p>}
      {state === "success" && <p role="status" className="text-sm text-primary">{text.success}</p>}
      {keys?.available === false && <p className="text-xs text-muted-foreground">{text.unavailable}</p>}
      {keys?.available !== false && (
        <form
          className="grid gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void link();
          }}
        >
          <label htmlFor="rout-chip-uid" className="text-xs text-muted-foreground">{text.hardwareId}</label>
          <div className="flex gap-2">
            <Input id="rout-chip-uid" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="h-9 min-w-0 font-mono text-xs" autoComplete="off" spellCheck={false} />
          </div>
          <label htmlFor="rout-activation" className="text-xs text-muted-foreground">{text.activation}</label>
          <Input id="rout-activation" type="password" value={activation} onChange={(e) => setActivation(e.target.value)} autoComplete="off" maxLength={128} />
          <Button type="submit" size="sm" variant="outline" disabled={scanning || pairing || manual.trim().length !== 36 || activation.trim().length < 20}>{pairing ? text.verifying : text.pair}</Button>
        </form>
      )}
      {keys === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label={text.loading} />
      ) : keys.keys.length > 0 ? (
        <ul className="grid gap-2">
          {keys.keys.map((k) => (
            <li key={k.hardware_id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-xs">
              <span className="grid">
                <span className="font-mono">{k.nfc_uid ?? "—"}</span>
                <span className={cn("text-[11px]", k.status === "active" ? "text-primary" : k.status === "pending" ? "text-muted-foreground" : "text-destructive")}>
                  {{ pending: text.pending, active: text.active, frozen: text.frozen, revoked: text.revoked }[k.status]}
                  {k.has_key ? ` · ${k.key_alg}` : ` · ${text.noKey}`}
                </span>
              </span>
              {k.status !== "revoked" && (
                <span className="flex gap-1">
                  {k.status !== "active" && k.has_key && <Button type="button" size="sm" variant="outline" onClick={() => void change(k.hardware_id, "active")}>{text.activate}</Button>}
                  {k.status === "active" && <Button type="button" size="sm" variant="outline" onClick={() => void change(k.hardware_id, "frozen")}>{text.freeze}</Button>}
                  <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => void change(k.hardware_id, "revoked")}>{text.revoke}</Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        keys.available && <p className="text-xs text-muted-foreground">{text.empty}</p>
      )}
    </section>
  );
}
