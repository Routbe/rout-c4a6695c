import { describe, expect, it } from "vitest";
import { checkCalendarUrlShape } from "./adapters/fetchers.server";
import { icsFeedCredentials } from "./types";

describe("calendar URL gate", () => {
  it("accepts public https feeds and webcal links", () => {
    expect(checkCalendarUrlShape("https://calendar.google.com/calendar/ical/x/basic.ics").hostname).toBe("calendar.google.com");
    expect(checkCalendarUrlShape("webcal://p01-caldav.icloud.com/published/2/abc").protocol).toBe("https:");
  });

  it.each([
    "http://example.org/feed.ics",
    "https://127.0.0.1/feed.ics",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/feed.ics",
    "https://localhost/feed.ics",
    "https://intranet.corp/feed.ics",
    "https://user:pass@calendar.example-host.org/feed.ics",
    "https://calendar.example-host.org:8443/feed.ics",
    "ftp://calendar.example-host.org/feed.ics",
  ])("rejects %s", (url) => {
    expect(() => checkCalendarUrlShape(url)).toThrow("invalid_url");
  });

  it("rejects userinfo and odd ports before anything is stored", () => {
    expect(icsFeedCredentials.safeParse({ url: "https://a:b@cal.example-host.org/x.ics" }).success).toBe(false);
    expect(icsFeedCredentials.safeParse({ url: "https://cal.example-host.org:8080/x.ics" }).success).toBe(false);
    expect(icsFeedCredentials.safeParse({ url: "https://cal.example-host.org/x.ics" }).success).toBe(true);
  });
});
