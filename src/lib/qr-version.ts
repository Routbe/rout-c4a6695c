/**
 * Dynamische QR-versieberekening.
 *
 * De encoder (qrcode-generator) kiest zelf al de kleinste versie die past —
 * deze module doet hetzelfde rekenwerk vooruit, zodat de UI kan zeggen hoe
 * groot de matrix wordt in plaats van te waarschuwen dat "Version 1 vol is".
 *
 * Er is dus géén harde 20-tekengrens meer: we schalen vloeiend van Version 1
 * (21×21) tot Version 10 (57×57).
 */

/** Hoogste versie die we aanbieden — daarboven wordt scannen onbetrouwbaar. */
export const QR_MAX_VERSION = 10;

/** Capaciteit per versie (1–10) bij foutcorrectieniveau M. */
const ALPHANUMERIC_CAPACITY_M = [20, 38, 61, 90, 122, 154, 178, 221, 262, 311];
const BYTE_CAPACITY_M = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213];

/** Tekens die de compacte alphanumeric mode toestaat. */
const ALPHANUMERIC_RE = /^[0-9A-Z$%*+\-./: ]*$/;

export type QrMode = "alphanumeric" | "byte";

export type QrVersionInfo = {
  /** Gekozen versie (1–10), of `QR_MAX_VERSION` als de payload te lang is. */
  version: number;
  /** Modules per zijde: 21 + (version - 1) * 4. */
  modules: number;
  mode: QrMode;
  /** Capaciteit van de gekozen versie in deze mode. */
  capacity: number;
  length: number;
  /** Past de payload binnen Version 1–10? */
  fits: boolean;
};

export function modulesForVersion(version: number): number {
  return 21 + (version - 1) * 4;
}

export function qrModeFor(payload: string): QrMode {
  return ALPHANUMERIC_RE.test(payload) ? "alphanumeric" : "byte";
}

/** Kleinste versie waarin `payload` past, met de bijhorende matrixgrootte. */
export function qrVersionFor(payload: string): QrVersionInfo {
  const value = payload ?? "";
  const mode = qrModeFor(value);
  const table = mode === "alphanumeric" ? ALPHANUMERIC_CAPACITY_M : BYTE_CAPACITY_M;
  const index = table.findIndex((cap) => value.length <= cap);
  const version = index === -1 ? QR_MAX_VERSION : index + 1;
  return {
    version,
    modules: modulesForVersion(version),
    mode,
    capacity: table[version - 1]!,
    length: value.length,
    fits: index !== -1,
  };
}
