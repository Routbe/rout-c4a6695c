import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api_/public/oauth/introspect")({ server: { handlers: {
  OPTIONS: async () => (await import("@/lib/oauth/token-request.server")).tokenOptions(),
  POST: async ({ request }) => {
    const { readTokenRequest, tokenFailure, TOKEN_CORS } = await import("@/lib/oauth/token-request.server");
    try {
      const input = await readTokenRequest(request);
      const { authenticateOAuthClient } = await import("@/lib/oauth/provider.server");
      await authenticateOAuthClient(input.clientId,input.clientSecret,input.ip,true);
      const { introspectOAuthToken } = await import("@/lib/oauth/tokens.server");
      return Response.json(await introspectOAuthToken(input.token,input.clientId),{ headers:TOKEN_CORS });
    } catch(error) { return tokenFailure(error); }
  },
} } });