import { describe, expect, it } from "vitest";
import { TOPICS, TOPIC_SLUGS, isTopicSlug, topicForPath, CHAPTER_TOPIC } from "./topics";
import { copyNl } from "./copy.nl";
import { copyEn } from "./copy.en";
import { copyFr } from "./copy.fr";
import { copyDe } from "./copy.de";

const ALL = { nl: copyNl, en: copyEn, fr: copyFr, de: copyDe };

describe("discover topics", () => {
  it("has exactly the ten product lines", () => {
    expect(TOPIC_SLUGS).toHaveLength(10);
    expect(isTopicSlug("rout-card")).toBe(true);
    expect(isTopicSlug("studio")).toBe(false);
  });

  it.each(Object.entries(ALL))("%s copy covers every topic with a label per detail link", (_, copy) => {
    for (const slug of TOPIC_SLUGS) {
      const c = copy.topics[slug];
      expect(c.docs).toHaveLength(TOPICS[slug].docs.length);
      expect(c.features).toHaveLength(4);
      expect(c.steps).toHaveLength(3);
      expect(c.faq.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("never sends the product's main button to the sign-in page or the Studio", () => {
    for (const slug of TOPIC_SLUGS) {
      expect(TOPICS[slug].primary).not.toMatch(/^\/(auth|studio|dashboard)/);
    }
  });

  it("maps the wallet info page to the ROUT card product", () => {
    expect(topicForPath("/info/wallet")).toBe("rout-card");
    expect(CHAPTER_TOPIC.wallet).toBe("rout-card");
  });

  it("gives bookings its own product page, reached from the bookings info page", () => {
    expect(isTopicSlug("bookings")).toBe(true);
    expect(TOPICS.bookings.primary).toBe("/info/bookings");
    expect(topicForPath("/info/bookings")).toBe("bookings");
    // Pages that are only listed (not owned) keep their first listing.
    expect(topicForPath("/info/guestbook")).toBe("profiles");
  });

  it.each(Object.entries(ALL))("%s bookings copy promises the 5-minute hold and never a Google or Outlook link", (_, copy) => {
    const text = JSON.stringify(copy.topics.bookings);
    expect(text).toMatch(/5 min/i);
    expect(text).not.toMatch(/google|outlook|microsoft/i);
  });

  it("says the private card code expires after a minute and needs two-step verification first", () => {
    expect(copyNl.topics["rout-card"].features.map((f) => f.text).join(" ")).toMatch(/minuut/);
    expect(copyNl.topics["rout-card"].steps[0]!.title).toMatch(/tweestapsverificatie/i);
  });
});
