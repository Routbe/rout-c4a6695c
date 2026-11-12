import { describe, expect, it } from "vitest";

import {
  extractHandle,
  handlePrefix,
  handleValidationError,
  isHandleBlock,
  normalizeSocialHandle,
  socialUrl,
} from "./social-handles";

describe("extractHandle — smart paste van volledige URLs", () => {
  it("haalt de Instagram-handle uit een URL met tracking-querystring", () => {
    expect(extractHandle("instagram", "https://instagram.com/jdelplanche?igsh=Nzh4bQ==")).toBe(
      "jdelplanche",
    );
  });

  it("ondersteunt www en trailing slash", () => {
    expect(extractHandle("instagram", "https://www.instagram.com/jdelplanche/")).toBe(
      "jdelplanche",
    );
  });

  it("haalt een YouTube @-kanaal uit de URL", () => {
    expect(extractHandle("youtube", "https://www.youtube.com/@channel")).toBe("channel");
  });

  it("haalt de handle uit een x.com URL", () => {
    expect(extractHandle("x", "https://x.com/user")).toBe("user");
  });

  it("behandelt twitter.com als X", () => {
    expect(extractHandle("x", "https://twitter.com/user?s=20")).toBe("user");
  });

  it("werkt zonder protocol", () => {
    expect(extractHandle("github", "github.com/routbe")).toBe("routbe");
  });

  it("haalt TikTok-handles met @ uit de URL", () => {
    expect(extractHandle("tiktok", "https://www.tiktok.com/@rout.be")).toBe("rout.be");
  });

  it("ondersteunt LinkedIn company- en in-paden", () => {
    expect(extractHandle("linkedin", "https://linkedin.com/in/jona-delplanche")).toBe(
      "jona-delplanche",
    );
    expect(extractHandle("linkedin", "https://www.linkedin.com/company/routbe/")).toBe("routbe");
  });

  it("valt terug op het laatste padsegment bij een onbekend platform", () => {
    expect(extractHandle("onbekend", "https://example.com/users/jona")).toBe("jona");
  });
});

describe("extractHandle — randgevallen", () => {
  it("knipt een leidende @ weg", () => {
    expect(extractHandle("instagram", "@jdelplanche")).toBe("jdelplanche");
  });

  it("trimt witruimte", () => {
    expect(extractHandle("instagram", "   jdelplanche  ")).toBe("jdelplanche");
  });

  it("geeft een lege string voor lege invoer", () => {
    expect(extractHandle("instagram", "")).toBe("");
    expect(extractHandle("instagram", "   ")).toBe("");
  });

  it("laat een gewone handle ongemoeid", () => {
    expect(extractHandle("github", "routbe")).toBe("routbe");
  });

  it("knipt querystring en slashes bij niet-URL invoer", () => {
    expect(extractHandle("instagram", "/jdelplanche?x=1")).toBe("jdelplanche");
  });

  it("laat ongeldige, niet-URL invoer ongewijzigd (behalve @ en witruimte)", () => {
    expect(extractHandle("instagram", " @@handle ")).toBe("handle");
    expect(extractHandle("instagram", "http:// broken url")).toBe("http:// broken url");
  });
});

describe("normalizeSocialHandle", () => {
  it("trimt, verwijdert @ en zet om naar kleine letters", () => {
    expect(normalizeSocialHandle("  @JDelPlanche ")).toBe("jdelplanche");
  });

  it("geeft een lege string voor lege invoer", () => {
    expect(normalizeSocialHandle("")).toBe("");
  });
});

describe("socialUrl", () => {
  it("bouwt een publieke URL met lowercase handle", () => {
    expect(socialUrl("instagram", "@JDelPlanche")).toBe("https://instagram.com/jdelplanche");
  });

  it("geeft een lege string zonder handle", () => {
    expect(socialUrl("instagram", "  ")).toBe("");
  });

  it("geeft een lege string voor platformen zonder base", () => {
    expect(socialUrl("wsocial", "jdelplanche")).toBe("https://wsocial.eu/profile/jdelplanche.wsocial.eu");
    expect(socialUrl("wsocial", "jona.com")).toBe("https://wsocial.eu/profile/jona.com");
  });
});

describe("handlePrefix & isHandleBlock", () => {
  it("geeft het zichtbare prefix zonder protocol", () => {
    expect(handlePrefix("instagram")).toBe("instagram.com/");
  });

  it("geeft null voor blokken zonder base", () => {
    expect(handlePrefix("wsocial")).toBe("@");
    expect(isHandleBlock("wsocial")).toBe(true);
    expect(isHandleBlock("signal")).toBe(false);
    expect(isHandleBlock("instagram")).toBe(true);
  });
});

describe("handleValidationError", () => {
  it("accepteert geldige handles", () => {
    expect(handleValidationError("instagram", "jdelplanche_1.0")).toBeNull();
    expect(handleValidationError("github", "rout-be")).toBeNull();
    expect(handleValidationError("x", "routbe")).toBeNull();
  });

  it("weigert verboden tekens", () => {
    expect(handleValidationError("instagram", "jona!")).toMatch(/Ongeldige tekens/);
    expect(handleValidationError("x", "jona.delplanche")).toMatch(/Ongeldige tekens/);
    expect(handleValidationError("github", "jona.be")).toMatch(/Ongeldige tekens/);
  });

  it("weigert opeenvolgende koppeltekens bij GitHub", () => {
    expect(handleValidationError("github", "jona--be")).toMatch(/Ongeldige tekens/);
    expect(handleValidationError("github", "-jona")).toMatch(/Ongeldige tekens/);
  });

  it("weigert te lange handles", () => {
    expect(handleValidationError("x", "a".repeat(16))).toMatch(/Maximaal 15 tekens/);
    expect(handleValidationError("instagram", "a".repeat(31))).toMatch(/Maximaal 30 tekens/);
  });

  it("geeft geen fout voor lege invoer of onbekende platformen", () => {
    expect(handleValidationError("instagram", "")).toBeNull();
    expect(handleValidationError("onbekend", "!!!")).toBeNull();
  });
});

import { describe as d2, expect as e2, it as i2 } from "vitest";
import { extractHandle as xh, socialUrl as su } from "./social-handles";
d2("smart paste for added platforms", () => {
  i2("strips pasted URLs to the username", () => {
    e2(xh("patreon", "https://www.patreon.com/c/jane?utm=1")).toBe("jane");
    e2(xh("calendly", "https://calendly.com/jane/30min")).toBe("jane");
  });
  i2("wsocial.eu appends .wsocial.eu", () => {
    e2(su("wsocial", "jane")).toContain("jane.wsocial.eu");
  });
});
