/**
 * Privacy smoke test: the codebase must not (re)introduce visitor tracking.
 * Referer, IP, user-agent storage, audit logs and third-party telemetry SDKs
 * are forbidden by project policy.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "test" || entry === "components" || entry === "integrations") continue;
      walk(full, files);
    } else if (
      /\.(ts|tsx)$/.test(entry) &&
      !full.endsWith(".gen.ts") &&
      // Auto-generated backend client files are out of scope: they are never
      // edited here and only read the browser referrer for the auth redirect.
      !/integrations[\\/]db[\\/]previewAuthStorage\.ts$/.test(full)
    ) {
      files.push(full);
    }
  }
  return files;
}

const sources = walk(ROOT).map((file) => ({ file, code: readFileSync(file, "utf8") }));

describe("privacy guarantees", () => {
  it("never stores referer data", () => {
    // Note: `referrer` as a referral *handle* (who invited a user) is a product
    // feature and unrelated to the HTTP Referer header this rule forbids.
    const offenders = sources
      .filter(({ code }) => /document\.referrer|http_referer|referer\s*[:=]/i.test(code))
      .map(({ file }) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it("never stores visitor ip addresses or user agents", () => {
    const offenders = sources
      // Auto-generated database typings are out of scope.
      .filter(({ file }) => !file.endsWith("types.ts"))
      .filter(({ code }) => /(ip_address|visitor_ip|user_agent)\s*[:=]/i.test(code))
      .map(({ file }) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it("bundles no third-party error or analytics SDK", () => {
    const offenders = sources
      .filter(({ code }) => /@sentry\/|posthog|mixpanel|google-analytics|\bgtag\(/i.test(code))
      .map(({ file }) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it("logs no referral visits and keeps no audit log writes", () => {
    const offenders = sources
      .filter(({ file }) => !file.endsWith("types.ts"))
      .filter(({ code }) => /referral_visits|trackReferralVisit/.test(code))
      .map(({ file }) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
