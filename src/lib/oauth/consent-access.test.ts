import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/developer-access", () => ({ requireDeveloperAccess: "developer-guard" }));
vi.mock("@/lib/auth/middleware", () => ({ requireAuth: "session-guard", optionalAuth: "optional-session" }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      guards: [] as unknown[],
      middleware: (guards: unknown[]) => { chain.guards = guards; return chain; },
      inputValidator: () => chain,
      handler: () => chain,
    };
    return chain;
  },
}));
import { describeAuthorizeRequest, decideAuthorizeRequest, sendStepUpCode, verifyStepUp, listOAuthClients, saveOAuthClient, deleteOAuthClient } from "./console.functions";

describe("login VIA ROUT is separate from the developer console", () => {
  for (const [name, fn] of Object.entries({ describeAuthorizeRequest, decideAuthorizeRequest, sendStepUpCode, verifyStepUp })) {
    it(`${name} permits signed-in members without developer workspace access`, () => {
      expect((fn as unknown as { guards: unknown[] }).guards).toEqual(["session-guard"]);
    });
  }
  for (const [name, fn] of Object.entries({ listOAuthClients, saveOAuthClient, deleteOAuthClient })) {
    it(`${name} still requires developer access`, () => {
      expect((fn as unknown as { guards: unknown[] }).guards).toEqual(["developer-guard"]);
    });
  }
});