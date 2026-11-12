import { afterEach, describe, expect, it, vi } from "vitest";
import { getSmsSender, missingSmsKeys, resolveGatewayUrl, smsProviderId } from "@/lib/phone/sms-provider.server";
import { normalizePhone, usesAutoSms } from "@/lib/phone/otp-rules";

afterEach(() => vi.unstubAllEnvs());

describe("SMS provider", () => {
  it("defaults to the Android gateway", () => {
    vi.stubEnv("SMS_PROVIDER", "");
    expect(smsProviderId()).toBe("android-gateway");
    vi.stubEnv("SMS_PROVIDER", "nonsense");
    expect(smsProviderId()).toBe("android-gateway");
  });

  it("sends nothing without keys", () => {
    vi.stubEnv("SMS_PROVIDER", "");
    vi.stubEnv("SMS_GATEWAY_USER", "");
    vi.stubEnv("SMS_GATEWAY_PASSWORD", "");
    vi.stubEnv("SMS_API_KEY", "");
    vi.stubEnv("PHONE_ENCRYPTION_KEY", "");
    expect(missingSmsKeys()).toContain("PHONE_ENCRYPTION_KEY");
    expect(getSmsSender()).toBeNull();
  });

  it("builds the sms-gate message URL", () => {
    expect(resolveGatewayUrl("https://api.sms-gate.app/")).toBe("https://api.sms-gate.app/3rdparty/v1/message");
    expect(resolveGatewayUrl("http://10.0.0.2/message")).toBe("http://10.0.0.2/message");
  });

  it("validates phone numbers to E.164", () => {
    expect(normalizePhone("32", "0470 12 34 56")).toBe("+32470123456");
    expect(normalizePhone("32", "12")).toBeNull();
    expect(normalizePhone("32", "0032470123456")).toBeNull();
  });

  it("auto-sends only to Belgian numbers", () => {
    expect(usesAutoSms("+32470123456")).toBe(true);
    expect(usesAutoSms("+31612345678")).toBe(false);
  });
});
