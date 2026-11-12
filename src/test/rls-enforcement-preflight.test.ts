import { expect, it } from "vitest";
import { enforcementBlockers } from "../../scripts/rls-enforcement-preflight";
it("refuses an owner connection even if the unused app role has no bypass", () => {
  expect(enforcementBlockers({ connectionRole: "neondb_owner", targetRole: "rout_app", bypass: true, superuser: false, ownsTables: true }, [], true)).toEqual(["runtime_role_mismatch", "runtime_bypassrls", "runtime_table_owner"]);
});
it("refuses incomplete RLS and unreviewed service paths", () => {
  expect(enforcementBlockers({ connectionRole: "rout_app", targetRole: "rout_app", bypass: true, superuser: false, ownsTables: false }, ["mastodon_app_registrations"], false)).toEqual(["runtime_bypassrls", "rls_disabled:mastodon_app_registrations", "service_paths_unreviewed"]);
});
it("accepts only a non-owner runtime with no bypass and reviewed service paths", () => {
  expect(enforcementBlockers({ connectionRole: "rout_app", targetRole: "rout_app", bypass: false, superuser: false, ownsTables: false }, [], true)).toEqual([]);
});