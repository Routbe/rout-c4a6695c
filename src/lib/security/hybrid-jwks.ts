export function hybridReadyJwks<T extends { keys: unknown[] }>(jwks: T) {
  return { ...jwks, rout_pq_readiness: { version: 1, status: "metadata-only", candidate: "ML-DSA-65", hybrid_signing_enabled: false, post_quantum_keys_published: false } };
}