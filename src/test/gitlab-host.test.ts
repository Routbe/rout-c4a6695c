import { describe, expect, it } from "vitest";
import * as authRoute from "@/routes/api_.auth.$";

describe("GitLab sign-in", () => {
  it("has no host interceptor that bounces requests back to rout.be", () => {
    expect("browserHost" in authRoute).toBe(false);
    expect("gitlabNeedsCanonicalHost" in authRoute).toBe(false);
  });
});
