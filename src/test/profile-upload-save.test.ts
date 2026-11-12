import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      validate: (input: unknown): unknown => input,
      middleware: () => chain,
      inputValidator: (validate: (input: unknown) => unknown) => { chain.validate = validate; return chain; },
      handler: () => chain,
    };
    return chain;
  },
}));
vi.mock("@/lib/auth/middleware", () => ({ requireAuth: {} }));
import { saveStudioProfile } from "@/lib/studio-profile.functions";
import { saveAliasProfile } from "@/lib/alias-profile.functions";

const avatar = "/api/public/avatar?path=12345678-1234-1234-1234-123456789abc%2Favatar-1729770000.webp";
describe("upload URL accepted by both profile save paths", () => {
  for (const [space, save] of [["verified", saveStudioProfile], ["alias", saveAliasProfile]] as const) {
    const validate = (save as unknown as { validate: (input: unknown) => { avatarUrl: string } }).validate;
    it(`${space} saves the exact first-party URL returned by avatar upload`, () => {
      expect(validate({ username: "anna", avatarUrl: avatar }).avatarUrl).toBe(avatar);
    });
    it(`${space} rejects arbitrary or malformed relative paths`, () => {
      for (const url of ["//evil.example/avatar", "/api/public/avatar?path=../../secret", `${avatar}&extra=1`, "/admin/avatar"]) {
        // Refused before saving: the validator returns a structured validation error instead of throwing a 500.
        expect(validate({ username: "anna", avatarUrl: url })).toHaveProperty("__invalid");
      }
    });
    it(`${space} saves only the canonical first-party Mastodon avatar handler`, () => {
      const url = "/api/public/integrations/mastodon/avatar?handle=%40alice%40mastodon.social";
      expect(validate({ username: "anna", avatarUrl: url }).avatarUrl).toBe(url);
      for (const bad of [url + "&extra=1", url + "#fragment", "/api/public/integrations/mastodon/avatar?handle=localhost", "/api/public/integrations/mastodon/avatar?handle=https%3A%2F%2Fmastodon.social%2F%40alice"]) {
        expect(validate({ username: "anna", avatarUrl: bad })).toHaveProperty("__invalid");
      }
    });
    it(`${space} accepts nested display prefs (qrSettings)`, () => {
      const r = validate({ username: "anna", displayPrefs: { qrSettings: { fg: "#000", logo: { size: 0.2 } } } } as never);
      expect(r).not.toHaveProperty("__invalid");
    });
    it(`${space} retains HTTPS storage upload support`, () => {
      const url = "https://member.s3.fr-par.scw.cloud/users/12345678-1234-1234-1234-123456789abc/avatar/photo.webp";
      expect(validate({ username: "anna", avatarUrl: url }).avatarUrl).toBe(url);
    });
  }
});