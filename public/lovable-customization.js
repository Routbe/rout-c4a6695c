/**
 * Lovable Template Customization Listener
 *
 * Drop-in script for Lovable template apps that enables live theme/font
 * customization from the Lovable template detail page preview.
 *
 * Message protocol:
 *   { type: "SET_STYLESHEET", payload: { stylesheet: string, fontLinks: [] } }
 *   { type: "SET_FONTS", payload: { heading: { family, url }, body: { family, url }, mono?: { family, url } } }
 *   { type: "SET_FONT_PAIR", payload: { serif: { family, url }, sans: { family, url } } }  // legacy
 */
(function () {
  "use strict";

  var VALID_ORIGINS = [
    /^https:\/\/.*\.lovable\.app$/,
    /^https:\/\/.*\.lovable\.dev$/,
    /^https:\/\/lovable\.dev$/,
  ];

  function isValidOrigin(origin) {
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
    return VALID_ORIGINS.some(function (pattern) {
      return pattern.test(origin);
    });
  }

  function isStylesheetMessage(data) {
    return (
      data &&
      data.type === "SET_STYLESHEET" &&
      data.payload &&
      typeof data.payload.stylesheet === "string"
    );
  }

  function isFontsMessage(data) {
    return data && data.type === "SET_FONTS" && data.payload;
  }

  function isFontPairMessage(data) {
    return (
      data &&
      data.type === "SET_FONT_PAIR" &&
      data.payload &&
      data.payload.serif &&
      data.payload.sans
    );
  }

  function isValidPayload(data) {
    return isStylesheetMessage(data) || isFontsMessage(data) || isFontPairMessage(data);
  }

  var STYLE_ID = "lovable-theme-override";
  var FONT_STYLE_ID = "lovable-font-override";

  function getOrCreateStyleElement(id) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    return el;
  }

  function handleSetStylesheet(payload) {
    getOrCreateStyleElement(STYLE_ID).textContent = payload.stylesheet;
  }

  function handleSetFonts(payload) {
    var css = ":root {";
    if (payload.heading) {
      if (payload.heading.url) loadFontLink("lovable-font-heading", payload.heading.url);
      css += "\n  --font-heading: " + payload.heading.family + ", sans-serif;";
      if (payload.heading.weight) {
        css += "\n  --font-heading-weight: " + payload.heading.weight + ";";
      }
    }
    if (payload.body) {
      if (payload.body.url) loadFontLink("lovable-font-body", payload.body.url);
      css += "\n  --font-body: " + payload.body.family + ", sans-serif;";
      if (payload.body.weight) {
        css += "\n  --font-body-weight: " + payload.body.weight + ";";
      }
    }
    if (payload.mono) {
      loadFontLink("lovable-font-mono", payload.mono.url);
      css += '\n  --font-mono: "' + payload.mono.family + '", monospace;';
    }
    css += "\n}";
    getOrCreateStyleElement(FONT_STYLE_ID).textContent = css;
  }

  // Legacy handler for backward compat
  function handleSetFontPair(payload) {
    handleSetFonts({
      heading: payload.serif,
      body: payload.sans,
    });
  }

  function loadFontLink(id, url) {
    var existing = document.getElementById(id);
    if (existing) existing.remove();
    var link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
  }

  function notifyParent(data) {
    try {
      var origin;
      if (document.location.ancestorOrigins && document.location.ancestorOrigins[0]) {
        origin = document.location.ancestorOrigins[0];
      } else if (document.referrer) {
        origin = new URL(document.referrer).origin;
      } else {
        return;
      }
      window.parent.postMessage(JSON.stringify(data), origin);
    } catch (e) {
      // silently ignore
    }
  }

  window.addEventListener("message", function (event) {
    if (!event.origin || !isValidOrigin(event.origin)) return;
    if (!isValidPayload(event.data)) return;

    if (isStylesheetMessage(event.data)) {
      handleSetStylesheet(event.data.payload);
    } else if (isFontsMessage(event.data)) {
      handleSetFonts(event.data.payload);
    } else if (isFontPairMessage(event.data)) {
      handleSetFontPair(event.data.payload);
    }
  });

  window.addEventListener("beforeunload", function () {
    notifyParent({ beforeunload: document.location.href });
  });

  notifyParent({ type: "lovable:ready" });
})();
