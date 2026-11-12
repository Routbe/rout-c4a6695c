/** Pure rules for platform integration killswitches (shared client/server). */
export type SwitchMode = "on" | "paused" | "off";
export type SwitchMap = Record<string, SwitchMode>;

export function switchMode(map: SwitchMap, provider: string): SwitchMode {
  return map[provider] ?? "on";
}
/** Public profiles hide providers that are switched off. */
export function isShownPublicly(map: SwitchMap, provider: string): boolean {
  return switchMode(map, provider) !== "off";
}
/** Live fetches only run when a provider is fully on. */
export function mayFetchLive(map: SwitchMap, provider: string): boolean {
  return switchMode(map, provider) === "on";
}
/** Members may only link/update a provider that is fully on. */
export function mayLink(map: SwitchMap, provider: string): boolean {
  return switchMode(map, provider) === "on";
}
