/**
 * Selection rules for the ROUT Push Protocol list on /dashboard/identity.
 * Apps on a private relay keep their relay address, so they are never pushed.
 */
export interface PushableApp {
  clientId: string;
  choiceId: string;
}

export function isPushable(app: PushableApp): boolean {
  return app.choiceId !== "relay";
}

export function pushableIds(apps: PushableApp[]): string[] {
  return apps.filter(isPushable).map((a) => a.clientId);
}

/** Select all pushable apps, or clear the selection when all are already picked. */
export function toggleAll(apps: PushableApp[], picked: string[]): string[] {
  const ids = pushableIds(apps);
  const all = ids.length > 0 && ids.every((id) => picked.includes(id));
  return all ? [] : ids;
}

export function togglePick(apps: PushableApp[], picked: string[], clientId: string): string[] {
  const app = apps.find((a) => a.clientId === clientId);
  if (!app || !isPushable(app)) return picked;
  return picked.includes(clientId) ? picked.filter((id) => id !== clientId) : [...picked, clientId];
}
