import { amIAdmin } from "@/lib/admin.functions";
import { getMyHandle } from "@/lib/claim.functions";
import { withAuthTimeout } from "@/lib/auth-timeout";
import { appMode } from "./app-mode";
import { postAuthDestination, safeNextPath } from "./auth/post-auth";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Right after sign-up the session token, the profile row (created by a
 * database trigger) and the first server-function call can land out of order.
 * Retrying a couple of times removes that race instead of dumping the member
 * on the wrong screen.
 */
async function readHandleWithRetry(attempts = 3): Promise<string | null | undefined> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      console.info(`[post-login:handle-check] attempt ${i + 1}/${attempts}`);
      const res = await withAuthTimeout(getMyHandle({}), "post-login:getMyHandle", 5_000);
      console.info(`[post-login:handle-result] ${res.handle ? "existing-member" : "new-member"}`);
      return res.handle ?? null;
    } catch (error) {
      console.error(`[post-login:handle-failed] attempt ${i + 1}/${attempts}`, error);
      if (i < attempts - 1) await sleep(400 * (i + 1));
    }
  }
  return undefined;
}

/**
 * Single source of truth for "where does a member land after signing in".
 *
 * Runs for every method (magic link, e-mail code, Google, GitHub, Fediverse):
 * admins go to the portal, members without a handle are sent into onboarding,
 * everyone else lands on their dashboard.
 */
export async function resolvePostLoginPath(explicitRedirect?: string | null): Promise<string> {
  const mode = appMode();
  if (mode === "admin") return postAuthDestination(mode, safeNextPath(explicitRedirect));
  try {
    const res = await withAuthTimeout(amIAdmin({}), "post-login:amIAdmin", 5_000);
    if (res.isAdmin && mode === "all") {
      console.info("[post-login:destination] /admin");
      return "/admin";
    }
  } catch (error) {
    console.error("[post-login:admin-check-failed]", error);
  }

  const handle = await readHandleWithRetry();
  if (handle) {
    const destination =
      explicitRedirect && explicitRedirect !== "/claim" ? postAuthDestination(mode, safeNextPath(explicitRedirect)) : "/dashboard/routes";
    console.info(`[post-login:destination] ${destination}`);
    return destination;
  }
  if (handle === null) {
    console.info("[post-login:destination] /onboarding");
    return "/onboarding";
  }
  // Either genuinely no handle yet, or the profile could not be read at all:
  // onboarding is the safe landing spot — it shows the identity card when a
  // handle already exists.
  console.error("[post-login:destination-fallback] profile state remained unavailable");
  return "/dashboard";
}
