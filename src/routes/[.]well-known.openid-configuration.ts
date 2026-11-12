import { createFileRoute } from "@tanstack/react-router";

/** OIDC discovery voor "Login met ROUT". */
export const Route = createFileRoute("/.well-known/openid-configuration")({
  server: {
    handlers: {
      GET: async () => {
        const { issuer, SUPPORTED_SCOPES } = await import("@/lib/oauth/provider.server");
        const { CLAIMS_SUPPORTED } = await import("@/lib/oauth/integration-templates");
        const iss = issuer();
        return Response.json(
          {
            issuer: iss,
            authorization_endpoint: `${iss}/oauth/authorize`,
            token_endpoint: `${iss}/api/public/oauth/token`,
            jwks_uri: `${iss}/.well-known/jwks.json`,
            userinfo_endpoint: `${iss}/api/public/oauth/userinfo`,
            response_types_supported: ["code"],
            response_modes_supported: ["query"],
            claims_parameter_supported: false,
            request_parameter_supported: false,
            request_uri_parameter_supported: false,
            grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
            subject_types_supported: ["public", "pairwise"],
            revocation_endpoint: `${iss}/api/public/oauth/revoke`,
            introspection_endpoint: `${iss}/api/public/oauth/introspect`,
            end_session_endpoint: `${iss}/oauth/end-session`,
            authorization_response_iss_parameter_supported: true,
            prompt_values_supported: ["none", "login", "consent"],
            acr_values_supported: ["urn:rout:acr:passkey"],
            id_token_signing_alg_values_supported: ["ES256"],
            scopes_supported: [...SUPPORTED_SCOPES],
            claims_supported: [...CLAIMS_SUPPORTED],
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
          },
          { headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } },
        );
      },
    },
  },
});
