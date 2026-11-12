import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The profile pages (/$username, /u/$username) render the profile itself and no <Outlet />,
// so their sub-pages (booking, tip, donate, extra pages) must not be nested under them,
// otherwise rout.be/<handle>/booking silently shows the profile instead of the booking page.
const routesDir = join(__dirname, "..", "routes");
const files = readdirSync(routesDir);

describe("profile sub-pages", () => {
  it("are not nested under a profile route without an outlet", () => {
    const nested = files.filter((f) => /^(u\.)?\$username\.[^.]+\.tsx$/.test(f));
    expect(nested).toEqual([]);
  });

  it("include the booking page as its own top-level page", () => {
    expect(files).toContain("$username_.booking.tsx");
    expect(readFileSync(join(routesDir, "$username_.booking.tsx"), "utf8")).toContain('createFileRoute("/$username_/booking")');
  });
});
