import { expect, it } from "vitest";
import { auditFailures } from "../../scripts/rls-audit-query";
it("fails enabled RLS without policies rather than declaring it secured", () => {
  expect(auditFailures([{ table_name: "bookings", rls: true, policies: [] }], [])).toEqual({ disabled: [], missingPolicies: ["bookings"], bypassRoles: [] });
});
it("reports an application role bypass even when policies exist", () => {
  expect(auditFailures([{ table_name: "bookings", rls: true, policies: [{ name: "scope" }] }], ["rout_app"]).bypassRoles).toEqual(["rout_app"]);
});