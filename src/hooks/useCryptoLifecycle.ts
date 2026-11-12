import { useCallback, useEffect, useRef } from "react";
import { captureEnclaveScope, EnclaveError } from "@/lib/crypto-enclave/client";

/** Suppress late crypto UI completions after lock, account remount or unmount. */
export function useCryptoLifecycle() {
  const generation = useRef(0);
  const mounted = useRef(true);
  const cancellation = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; cancellation.current?.abort(); cancellation.current = null; };
  }, []);
  const invalidate = useCallback(() => { generation.current++; cancellation.current?.abort(); cancellation.current = null; }, []);
  const capture = useCallback(() => {
    const local = generation.current;
    const scope = captureEnclaveScope();
    if (!cancellation.current) cancellation.current = new AbortController();
    const localSignal = cancellation.current.signal;
    return {
      signal: AbortSignal.any([scope.signal, localSignal]),
      isUiCurrent: () => mounted.current && local === generation.current,
      assertCurrent: () => {
        scope.assertCurrent();
        if (!mounted.current || local !== generation.current) throw new EnclaveError("enclave_crashed");
      },
      isCurrent: () => {
        try { scope.assertCurrent(); return mounted.current && local === generation.current; } catch { return false; }
      },
    };
  }, []);
  return { capture, invalidate };
}