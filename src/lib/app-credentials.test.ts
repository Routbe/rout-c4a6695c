import { expect, it } from "vitest";
import { appCredentialVisible } from "./app-credentials";
const allowed = { acceptedAt: "2026-11-01", revokedAt: null, appPublic: true, profilePublic: true, consentActive: true };
it("credentials require recipient acceptance", () => { expect(appCredentialVisible({ ...allowed, acceptedAt: null })).toBe(false); });
it("app visibility is opt-in", () => { expect(appCredentialVisible({ ...allowed, appPublic: false })).toBe(false); });
it("private profiles never expose credentials", () => { expect(appCredentialVisible({ ...allowed, profilePublic: false })).toBe(false); });
it("revoked credentials are hidden", () => { expect(appCredentialVisible({ ...allowed, revokedAt: "2026-11-01" })).toBe(false); });
it("revoked consent hides app credentials", () => { expect(appCredentialVisible({ ...allowed, consentActive: false })).toBe(false); });
it("accepted credentials with every visibility gate open can be shown", () => { expect(appCredentialVisible(allowed)).toBe(true); });