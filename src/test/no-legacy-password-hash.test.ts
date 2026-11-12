import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}

describe("legacy password column", () => {
  it("no application code touches public.users.password_hash", () => {
    const offenders = files("src/lib")
      .concat(files("src/routes"))
      .filter((f) => !f.endsWith(".gen.ts") && readFileSync(f, "utf8").includes("password_hash"));
    expect(offenders).toEqual([]);
  });
});
