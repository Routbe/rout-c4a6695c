import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api_/public/oauth/revoke")({ server: { handlers: {
  OPTIONS: async () => (await import("@/lib/oauth/token-request.server")).tokenOptions(),
  POST: async ({ request }) => {
    const { readTokenRequest, tokenFailure, TOKEN_CORS } = await import("@/lib/oauth/token-request.server");
    try {
      const input = await readTokenRequest(request);
      const { authenticateOAuthClient } = await import("@/lib/oauth/provider.server");
      await authenticateOAuthClient(input.clientId,input.clientSecret,input.ip);
      const { revokeOAuthToken } = await import("@/lib/oauth/tokens.server");
      await revokeOAuthToken(input.token,input.clientId);
      return new Response(null,{ status:200,headers:TOKEN_CORS });
    } catch(error) { return tokenFailure(error); }
  },
} } });