import { describe, expect, it } from "vitest";
import { passkeyErrorMessage } from "./passkey-errors";

describe("passkeyErrorMessage", () => {
  it("cancel is friendly", () => expect(passkeyErrorMessage("NotAllowedError")).toMatch(/cancelled/));
  it("duplicate is explained", () =>
    expect(passkeyErrorMessage("ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED")).toMatch(/already has a passkey/));
  it("server failure", () => expect(passkeyErrorMessage("X", 500)).toMatch(/server/));
});
