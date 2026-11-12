import { describe, expect, it } from "vitest";
import { authConfigurationReadiness } from "@/lib/auth-readiness";

describe("account configuration readiness", () => {
  it("reports missing database before a missing signing secret", () => expect(authConfigurationReadiness(false, false)).toEqual({ ready: false, code: "missing_database" }));
  it("does not accept a signing secret without a database", () => expect(authConfigurationReadiness(false, true)).toEqual({ ready: false, code: "missing_database" }));
  it("requires a signing secret for configured database transport", () => expect(authConfigurationReadiness(true, false)).toEqual({ ready: false, code: "missing_secret" }));
  it("allows configured authentication to continue to its existing checks", () => expect(authConfigurationReadiness(true, true)).toEqual({ ready: true, code: null }));
});