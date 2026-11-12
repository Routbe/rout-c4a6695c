import { describe, expect, it } from "vitest";
import { sanitizeForwardedHtml } from "./sanitize-html";

describe("sanitizeForwardedHtml", () => {
  it("verwijdert scripts volledig, inclusief inhoud", () => {
    const out = sanitizeForwardedHtml('<p>Hallo</p><script>alert("xss")</script>');
    expect(out).toBe("<p>Hallo</p>");
    expect(out).not.toContain("alert");
  });

  it("verwijdert formulieren en iframes met inhoud", () => {
    const out = sanitizeForwardedHtml(
      '<form action="https://evil.example"><input name="pw"></form><iframe src="https://evil.example"></iframe><p>ok</p>',
    );
    expect(out).toBe("<p>ok</p>");
  });

  it("verwijdert event handlers en javascript:-URLs", () => {
    const out = sanitizeForwardedHtml(
      '<a href="javascript:alert(1)" onclick="steal()">klik</a>',
    );
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("onclick");
    expect(out).toContain(">klik</a>");
  });

  it("behoudt veilige opmaak en https-links met nofollow", () => {
    const out = sanitizeForwardedHtml(
      '<p>Beste <strong>naam</strong>, zie <a href="https://rout.be/u/jon">mijn profiel</a>.</p>',
    );
    expect(out).toContain("<strong>naam</strong>");
    expect(out).toContain('href="https://rout.be/u/jon"');
    expect(out).toContain('rel="nofollow noopener"');
  });

  it("escapes losse tekst en laat onbekende tags weg maar behoudt tekst", () => {
    const out = sanitizeForwardedHtml("<custom-tag>1 < 2 & 3</custom-tag>");
    expect(out).toContain("1 &lt; 2 &amp; 3");
    expect(out).not.toContain("custom-tag");
  });

  it("blokkeert http:- en data:-URLs in afbeeldingen", () => {
    const out = sanitizeForwardedHtml(
      '<img src="http://tracker.example/pixel.gif"><img src="data:text/html;base64,PGI+"><img src="https://rout.be/icon.png" alt="icoon">',
    );
    expect(out).not.toContain("tracker.example");
    expect(out).not.toContain("data:text");
    expect(out).toContain('src="https://rout.be/icon.png"');
  });

  it("verwijdert style- en svg-blokken volledig", () => {
    const out = sanitizeForwardedHtml(
      "<style>body{display:none}</style><svg><script>x()</script></svg><p>zichtbaar</p>",
    );
    expect(out).toBe("<p>zichtbaar</p>");
  });
});
