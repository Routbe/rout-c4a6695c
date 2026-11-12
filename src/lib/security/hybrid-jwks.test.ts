import { expect, it } from "vitest";
import { hybridReadyJwks } from "./hybrid-jwks";
it("preserves current verification keys without claiming active ML-DSA signing", () => {
  const keys = [{ kty: "EC", crv: "P-256", alg: "ES256", kid: "live" }];
  const result = hybridReadyJwks({ keys });
  expect(result.keys).toEqual(keys);
  expect(result.rout_pq_readiness.hybrid_signing_enabled).toBe(false);
  expect(result.rout_pq_readiness.post_quantum_keys_published).toBe(false);
});