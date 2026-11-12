import { describe, expect, it } from "vitest";
import { isInAppBrowser, shouldShowIosInstallHint, systemBrowserUrl } from "./in-app-browser";

const IG = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0";
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
const TIKTOK_ANDROID = "Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 musical_ly_2023";

describe("in-app browser detection", () => {
  it("flags Instagram and TikTok, not Safari", () => {
    expect(isInAppBrowser(IG)).toBe(true);
    expect(isInAppBrowser(TIKTOK_ANDROID)).toBe(true);
    expect(isInAppBrowser(SAFARI)).toBe(false);
  });
  it("builds a Chrome intent only on Android", () => {
    expect(systemBrowserUrl("https://rout.be/u/jan?x=1", TIKTOK_ANDROID)).toBe("intent://rout.be/u/jan?x=1#Intent;scheme=https;package=com.android.chrome;end");
    expect(systemBrowserUrl("https://rout.be/", IG)).toBeNull();
  });
});


describe("iOS install hint", () => {
  const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  it("shows on iPhone Safari that is not installed yet", () => {
    expect(shouldShowIosInstallHint(safari, false)).toBe(true);
  });
  it("never shows once installed, in Chrome on iOS or inside Instagram", () => {
    expect(shouldShowIosInstallHint(safari, true)).toBe(false);
    expect(shouldShowIosInstallHint(safari.replace("Version/18.0", "CriOS/130.0"), false)).toBe(false);
    expect(shouldShowIosInstallHint(`${safari} Instagram 300.0`, false)).toBe(false);
  });
});
