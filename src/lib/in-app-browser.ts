/** Recognises in-app WebViews (social apps, QR scanners) from the user agent. Pure and testable. */
const IN_APP = /(Instagram|FBAN|FBAV|FB_IAB|Snapchat|TikTok|musical_ly|Bytedance|LinkedInApp|Twitter|Line\/|MicroMessenger|Pinterest|GSA\/|; wv\))/i;

export function isInAppBrowser(ua: string): boolean {
  return IN_APP.test(ua);
}

/** Android can hand the page to Chrome via an intent URL; iOS has no equivalent. */
export function systemBrowserUrl(href: string, ua: string): string | null {
  if (!/Android/i.test(ua)) return null;
  const u = new URL(href);
  return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;end`;
}

/**
 * iPhone/iPad Safari that is not yet installed: only there does "Share → Add to
 * Home Screen" exist, and iOS never shows an install prompt by itself.
 * Chrome/Firefox/Edge on iOS (CriOS/FxiOS/EdgiOS) and in-app WebViews are excluded.
 */
export function shouldShowIosInstallHint(ua: string, standalone: boolean): boolean {
  if (standalone || isInAppBrowser(ua)) return false;
  const iOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile\//i.test(ua));
  return iOS && /Safari\//i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
}
