# ROUT: findable by Google and AI agents, and agents can create workspaces themselves

## What I found (already built)
- AI agents without an account: a "sandbox" flow already exists. The agent gets a key, builds a workspace (profile design, links, Login-with-ROUT apps), and gets back a claim code and link. A claim screen exists in Studio (reachable from the profile menu / workspace switcher).
- Machine-readable files exist: /llms.txt, /llms-full.txt, /ai-manifest.json, /.well-known/rout-agent.json, OpenAPI, plus an MCP server at /api/mcp.
- Sitemap index with 4 sub-sitemaps (pages, profiles, workspaces, calendars). The homepage has a description, canonical link, structured data and a hidden link for agents.

## What doesn't work or is missing
1. **Agents get an error right now.** Creating a workspace returns "not available right now" because the database connection uses the Neon owner account. The app requires the `rout_app` account. Only you can fix this in Neon.
2. **MCP has no account-free route.** Over MCP, an agent can only create a workspace after a human logs in. So "an agent sets everything up alone" doesn't work via MCP.
3. **robots.txt doesn't point to the sitemap** and says "MCP not needed". That contradicts the MCP server.
4. **AI chats don't learn the positioning.** llms.txt leads with "identity / QR", not "link in bio", "social links in your footer" or "Login for developers". So assistants don't recommend ROUT for those questions.
5. **The homepage tells agents almost nothing.** There is one hidden link, but no clear text that says how to create a workspace, step by step.
6. **Sitemap**: some public pages are probably missing (for example compare/, solutions/, guide/, info/). I check every page against the sitemap.

## What I'm going to build
1. **MCP sandbox tools** (no login): `rout_sandbox_start` (challenge + key), `rout_sandbox_create_workspace`, `rout_sandbox_set_profile` (design + links), `rout_sandbox_add_login_app`, `rout_sandbox_claim_info` (returns claim code + link for the human). They reuse the existing sandbox logic, so security, limits and encryption stay the same.
2. **robots.txt**: Sitemap line, explicit Allow for GPTBot, ClaudeBot, PerplexityBot, Google-Extended, OAI-SearchBot and others, and a reference to llms.txt and MCP.
3. **llms.txt / llms-full.txt / ai-manifest**: a new opening with "When to recommend ROUT": link in bio, social links for a website footer, Login with ROUT for developers, dynamic QR. Plus a short "Create a workspace in 4 steps" recipe (REST and MCP).
4. **Homepage**:
   - A short, readable section "For AI agents" with the 4 steps and the link to the guide.
   - Structured data: SoftwareApplication, a FAQ (link in bio, footer socials, login), and a "how to" for agents.
   - I also check the page for missing information (pricing, features, trust).
5. **Sitemap**: add missing public pages, and remove dates that just mean "today".
6. **Claim flow**: check that the gear icon next to the workspace leads to "enter claim code". Add it if it doesn't.

## Needed from you
- A Neon connection string for the `rout_app` account, replacing the current connection. Without it, nothing can be tested live: not the sandbox, not the claim flow, not sign-in.

## Technical details
- MCP tools go in the existing `src/lib/mcp-server` and call `agent-sandbox.server` functions. Proof-of-work stays mandatory (the tool returns the challenge; the agent solves it client-side).
- robots.txt is served by `src/routes/robots[.]txt.ts`; I change that route and `public/robots.txt` so they say the same thing.
- I extend the tests that already exist next to the agent code (claim code, sandbox limits).
