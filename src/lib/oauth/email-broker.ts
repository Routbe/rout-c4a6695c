/** Per-app email choice ("Sovereign Email Broker"). Pure and browser-safe. */

export type EmailSource = "primary" | "alias" | "relay";
export type EmailOption = { id: string; source: EmailSource; aliasId: string | null; email: string; verified: boolean };
export type EmailAssignment = { source: EmailSource; aliasId: string | null } | null;

/** Primary first, then active aliases, then the app's private relay (when given); duplicates removed. */
export function emailOptions(
  primary: { email: string | null; verified: boolean },
  aliases: { id: string; alias: string; status: string }[],
  relayAddress?: string | null,
): EmailOption[] {
  const out: EmailOption[] = [];
  const seen = new Set<string>();
  if (primary.email) {
    out.push({ id: "primary", source: "primary", aliasId: null, email: primary.email, verified: primary.verified });
    seen.add(primary.email.toLowerCase());
  }
  for (const a of aliases) {
    if (a.status !== "active" || !a.alias.includes("@") || seen.has(a.alias.toLowerCase())) continue;
    seen.add(a.alias.toLowerCase());
    out.push({ id: a.id, source: "alias", aliasId: a.id, email: a.alias, verified: true });
  }
  // The relay forwards only to a verified primary, so it is offered only then.
  if (relayAddress && primary.email && primary.verified) {
    out.push({ id: "relay", source: "relay", aliasId: null, email: relayAddress, verified: true });
  }
  return out;
}

/** Explicit private choices fail closed when unavailable; never disclose primary instead. */
export function resolveAppEmail(assignment: EmailAssignment, options: EmailOption[]): EmailOption | null {
  if (assignment?.source === "relay") {
    return options.find((o) => o.source === "relay") ?? null;
  }
  if (assignment?.source === "alias") {
    return options.find((o) => o.source === "alias" && o.aliasId === assignment.aliasId) ?? null;
  }
  return options.find((o) => o.source === "primary") ?? null;
}

/** Validates a consent-screen choice against the user's own options. */
export function pickOption(choiceId: string | undefined, options: EmailOption[]): EmailOption | null {
  if (!choiceId) return null;
  return options.find((o) => o.id === choiceId) ?? null;
}
