import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { draftJsonRecordSchema } from "./draft-json-schema";
import {
  diffStudioSnapshot,
  hasPatches,
  parsePatch,
  profileMetaPatchSchema,
  profileThemePatchSchema,
  type StudioSnapshot,
} from "./profile-draft-patch";
import { normalizeQrSettings } from "./qr-settings";

const emptyAlias: StudioSnapshot = {
  username: "nieuw-alias",
  displayName: null,
  tagline: null,
  avatarUrl: null,
  faviconUrl: null,
  theme: "noir",
  cardStyle: "bordered",
  prefs: { qrSettings: normalizeQrSettings({ fgColor: "#000000" }) },
  blocks: [],
};

describe("draft JSON boundary", () => {
  it("accepts a normalized QR style with undefined optional keys (the old 422)", () => {
    const qr = normalizeQrSettings({ fgColor: "#000000" });
    expect(draftJsonRecordSchema.safeParse({ qrSettings: qr }).success).toBe(true);
  });
});

describe("atomic studio patches", () => {
  it("restoring the confirmed published snapshot leaves no unsaved patches", () => {
    const restored = { ...emptyAlias, displayName: "Published name" };
    expect(hasPatches(diffStudioSnapshot(restored, { ...restored }))).toBe(false);
    expect(hasPatches(diffStudioSnapshot(restored, { ...restored, displayName: "New local edit" }))).toBe(true);
  });
  it("changing only the name sends only the name", () => {
    const patches = diffStudioSnapshot(emptyAlias, { ...emptyAlias, displayName: "Mijn alias" });
    expect(patches).toEqual({ meta: { displayName: "Mijn alias" }, theme: null, links: null });
  });

  it("a name-only meta patch validates without any displayPrefs", () => {
    const parsed = parsePatch(profileMetaPatchSchema, { space: "alias", displayName: "Mijn alias" });
    expect(parsed).toEqual({ space: "alias", displayName: "Mijn alias" });
  });

  it("a theme patch without prefs gets empty defaults instead of failing", () => {
    const parsed = parsePatch(profileThemePatchSchema, { space: "alias", theme: "noir" });
    expect(parsed).toEqual({ space: "alias", theme: "noir", prefs: {}, dropPrefs: [] });
  });

  it("only changed and removed pref keys are sent", () => {
    const saved = { ...emptyAlias, prefs: { a: 1, b: 2 } };
    const patches = diffStudioSnapshot(saved, { ...saved, prefs: { a: 1, c: 3 } });
    expect(patches.theme).toEqual({ prefs: { c: 3 }, dropPrefs: ["b"] });
  });

  it("rejects an unknown canvas", () => {
    expect(parsePatch(profileMetaPatchSchema, { space: "other", displayName: "x" })).toHaveProperty("__invalid");
  });
});

describe("patch_profile_draft (0160)", () => {
  it("merges one section, keeps the rest, and repairs missing displayPrefs", async () => {
    const db = new PGlite();
    await db.exec(`
      create role rout_app;
      create table public.profile_drafts (
        user_id uuid not null, space text not null, payload jsonb not null default '{}'::jsonb,
        revision bigint not null default 1, published_revision bigint not null default 0,
        updated_at timestamptz not null default now(), primary key (user_id, space));
      insert into public.profile_drafts (user_id, space, payload) values
        ('00000000-0000-0000-0000-000000000001', 'alias', '{"username":"nieuw","theme":"noir"}'),
        ('00000000-0000-0000-0000-000000000001', 'verified', '{"username":"echt","displayName":"Echt"}');
    `);
    await db.exec(readFileSync(join(process.cwd(), "db/0160_profile_draft_patch.sql"), "utf8"));
    const res = await db.query<{ revision: number }>(
      `select * from public.patch_profile_draft($1, 'alias', $2::jsonb, '{}'::jsonb, '{}'::text[])`,
      ["00000000-0000-0000-0000-000000000001", JSON.stringify({ displayName: "Mijn alias" })],
    );
    expect(Number(res.rows[0]?.revision)).toBe(2);
    const rows = await db.query<{ space: string; payload: Record<string, unknown> }>(
      `select space, payload from public.profile_drafts order by space`,
    );
    expect(rows.rows[0]?.payload).toEqual({ username: "nieuw", theme: "noir", displayName: "Mijn alias", displayPrefs: {} });
    // The other canvas is untouched.
    expect(rows.rows[1]?.payload).toEqual({ username: "echt", displayName: "Echt" });
    await db.close();
  }, 60_000);
});
