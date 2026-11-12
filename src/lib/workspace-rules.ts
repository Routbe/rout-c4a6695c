import { isReservedName } from "./reserved-brands";
/** Pure workspace/RBAC rules — shared by server checks and UI, unit-tested. */

export const WORKSPACE_ROLES = ["owner", "admin", "developer", "editor", "viewer"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Eigenaar",
  admin: "Admin",
  developer: "Developer",
  editor: "Editor",
  viewer: "Viewer",
};

export function isWorkspaceRole(v: unknown): v is WorkspaceRole {
  return typeof v === "string" && (WORKSPACE_ROLES as readonly string[]).includes(v);
}

/** Developer Console and API Keys & Webhooks. Personal context (null) = full access to own apps. */
export function canUseDeveloperTools(role: WorkspaceRole | null): boolean {
  return role === null || role === "owner" || role === "admin" || role === "developer";
}

/** Team tab: view and manage members. */
export function canManageTeam(role: WorkspaceRole | null): boolean {
  return role === "owner" || role === "admin";
}

/** Only owners may hand out or take away the owner role. */
export function canAssignRole(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  if (!canManageTeam(actor)) return false;
  return target !== "owner" || actor === "owner";
}

export type MemberChange =
  | { kind: "remove"; targetRole: WorkspaceRole }
  | { kind: "role"; targetRole: WorkspaceRole; nextRole: WorkspaceRole };

/**
 * Decides whether a member change is allowed. Returns an error message or null.
 * A workspace always keeps at least one owner.
 */
export function checkMemberChange(actor: WorkspaceRole, change: MemberChange, ownerCount: number): string | null {
  if (!canManageTeam(actor)) return "Alleen eigenaars en admins beheren het team.";
  if (change.targetRole === "owner" && actor !== "owner") return "Alleen een eigenaar kan een eigenaar wijzigen.";
  if (change.kind === "role" && !canAssignRole(actor, change.nextRole)) return "Alleen een eigenaar kan iemand eigenaar maken.";
  const losesOwner = change.targetRole === "owner" && (change.kind === "remove" || change.nextRole !== "owner");
  if (losesOwner && ownerCount <= 1) return "Een workspace heeft altijd minstens één eigenaar.";
  return null;
}

export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 39);
}

/** Workspace-adres rout.be/w/<naam>: min. 3 tekens, alleen a-z, 0-9 en koppeltekens. */
export const WORKSPACE_SLUG_RE = /^[a-z0-9-]+$/;
export const RESERVED_WORKSPACE_SLUGS = ["admin", "api", "auth", "u", "w", "studio", "settings", "rout"] as const;

/** `brandReleased`: the caller holds an admin release for this protected brand name (checked server-side). */
export function isValidWorkspaceSlug(slug: string, opts: { brandReleased?: boolean } = {}): boolean {
  return (
    slug.length >= 3 &&
    slug.length <= 40 &&
    WORKSPACE_SLUG_RE.test(slug) &&
    !(RESERVED_WORKSPACE_SLUGS as readonly string[]).includes(slug) &&
    (opts.brandReleased === true || !isReservedName(slug).reserved)
  );
}

/** Bouwt een geldig workspace-adres uit een naam; poging > 0 voegt "-<n>" toe bij een bezet adres. */
export function workspaceSlug(name: string, attempt = 0): string {
  let base = slugify(name).slice(0, 34).replace(/-+$/, "");
  if (!isValidWorkspaceSlug(base)) base = `${base || "team"}-team`.replace(/^-+/, "");
  return attempt > 0 ? `${base}-${Math.trunc(attempt) + 1}` : base;
}

/** Namespace matrix: free workspaces always get a random 4-char suffix; paid plans may hold the clean slug. */
export type WorkspaceSlugPlan = "free" | "plus" | "pro";
const SUFFIX_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function randomSlugSuffix(bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(4))): string {
  return Array.from(bytes.slice(0, 4), (b) => SUFFIX_ALPHABET[b % SUFFIX_ALPHABET.length]).join("");
}

export function matrixWorkspaceSlug(name: string, plan: WorkspaceSlugPlan, suffix: string = randomSlugSuffix()): string {
  let base = slugify(name).slice(0, 34).replace(/-+$/, "");
  if (base.length < 3 || isReservedName(base).reserved) base = `${base || "team"}-team`.replace(/^-+/, "");
  return plan === "free" ? `${base}-${suffix}` : base;
}

/**
 * Paid plans (or an Early Verified owner, via the entitlement engine) may drop the random suffix.
 * Mirrors public.workspace_may_drop_suffix in db/0122.
 */
export function planAllowsCleanSlug(plan: string, opts: { earlyVerified?: boolean } = {}): boolean {
  return plan === "plus" || plan === "pro" || plan === "business" || opts.earlyVerified === true;
}

export type CleanSlugInput = {
  plan: string;
  earlyVerified?: boolean;
  slug: string;
  currentSlug: string;
  reserved: boolean;
  brandReleased: boolean;
  taken: boolean;
};

/** Decides a clean-slug claim after an upgrade. Returns a Dutch error message, or null when allowed. */
export function checkCleanSlugClaim(i: CleanSlugInput): string | null {
  if (!planAllowsCleanSlug(i.plan, { earlyVerified: i.earlyVerified })) return "Een schone workspace-naam is beschikbaar vanaf Plus of Pro, of met Early Verified.";
  if (i.slug === i.currentSlug) return "Dit is al het adres van je workspace.";
  if (i.reserved && !i.brandReleased) return "Deze naam is beschermd. Vraag een merkvrijgave aan bij ROUT.";
  if (!isValidWorkspaceSlug(i.slug, { brandReleased: i.brandReleased })) return "Gebruik minstens 3 tekens: kleine letters, cijfers en koppeltekens.";
  if (i.taken) return "Dit workspace-adres is al in gebruik.";
  return null;
}

export type RootSlugInput = {
  plan: string;
  earlyVerified?: boolean;
  slug: string;
  reserved: boolean;
  brandReleased: boolean;
  /** Held by a personal handle, alias, DNS claim or another workspace's root alias. */
  takenByHandle: boolean;
  /** Collides with a fixed app route (rout.be/studio, /api, …). */
  systemRoute: boolean;
};

/** Root address rout.be/<slug> for a workspace: same plan, brand and uniqueness rules as a clean slug. */
export function checkRootSlugClaim(i: RootSlugInput): string | null {
  if (!planAllowsCleanSlug(i.plan, { earlyVerified: i.earlyVerified })) return "Een root-adres is beschikbaar vanaf Plus of Pro, of met Early Verified.";
  if (i.systemRoute) return "Dit adres is gereserveerd voor ROUT zelf.";
  if (i.reserved && !i.brandReleased) return "Deze naam is beschermd. Vraag een merkvrijgave aan bij ROUT.";
  if (!isValidWorkspaceSlug(i.slug, { brandReleased: i.brandReleased })) return "Gebruik minstens 3 tekens: kleine letters, cijfers en koppeltekens.";
  if (i.takenByHandle) return "Dit adres is al in gebruik door een profiel of een andere workspace.";
  return null;
}

/** Rename: owner/admin, 1–80 characters after trimming. */
export function checkWorkspaceRename(role: WorkspaceRole | null, name: string): string | null {
  if (!canManageTeam(role)) return "Alleen eigenaars en admins wijzigen de naam.";
  const n = name.trim();
  if (!n || n.length > 80) return "Gebruik een naam van 1 tot 80 tekens.";
  return null;
}

/** Delete: only the owner, after typing the exact workspace name. */
export function checkWorkspaceDelete(role: WorkspaceRole | null, workspaceName: string, confirmation: string): string | null {
  if (role !== "owner") return "Alleen de eigenaar kan deze workspace verwijderen.";
  if (confirmation.trim() !== workspaceName.trim()) return "Typ de exacte naam van de workspace om te bevestigen.";
  return null;
}

/** Workspace Profile Hub (link-in-bio): owners, admins and editors edit; developers and viewers only look. */
export function canEditWorkspaceHub(role: WorkspaceRole | null): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

export type InviteTarget = { kind: "email"; value: string } | { kind: "username"; value: string };

/** Reads an invite field: an e-mail address, or a ROUT @username (3–30 tekens: a-z, 0-9, punt, koppel- of laag streepje). */
export function parseInviteTarget(raw: string): InviteTarget | null {
  const v = raw.trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254) return { kind: "email", value: v };
  const handle = v.replace(/^@/, "");
  if (/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(handle)) return { kind: "username", value: handle };
  return null;
}

/** Human label for an invite target, as shown in lists. */
export function inviteTargetLabel(t: InviteTarget): string {
  return t.kind === "username" ? `@${t.value}` : t.value;
}

/**
 * Free workspaces may rename the part of their slug they chose; the 4-char
 * suffix stays. Returns the new slug, or an error message.
 */
export function slugWithKeptSuffix(currentSlug: string, base: string): { slug: string } | { error: string } {
  const suffix = /-([a-z0-9]{4})$/.exec(currentSlug)?.[1];
  const clean = slugify(base).replace(/^-+|-+$/g, "");
  if (clean.length < 3) return { error: "Kies minstens 3 tekens (letters, cijfers of streepjes)." };
  const slug = suffix ? `${clean.slice(0, 35)}-${suffix}` : clean.slice(0, 40);
  if (!isValidWorkspaceSlug(slug)) return { error: "Deze naam is niet toegestaan of gereserveerd." };
  return { slug };
}

/**
 * Public path of a workspace: always `/w/<slug>`, or `/<domain>` once its own
 * domain is DNS-verified. Never `/u/` — that namespace is for people only.
 */
export function workspacePublicPath(slug: string, domain: { name: string | null; verified: boolean } | null): string {
  return domain?.verified && domain.name ? `/${domain.name.toLowerCase()}` : `/w/${slug}`;
}
