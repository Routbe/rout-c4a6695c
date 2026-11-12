import { describe, expect, it } from "vitest";
import { ageOn, canSendQuestion, isMinorDob, signupAgeProblem } from "./minor-safety";

const today = new Date(Date.UTC(2026, 10, 2));

describe("minor safety", () => {
  it("is a minor until the 16th birthday", () => {
    expect(isMinorDob("2010-11-03", today)).toBe(true);
    expect(isMinorDob("2010-11-02", today)).toBe(false);
    expect(ageOn("2010-11-02", today)).toBe(16);
  });
  it("rejects impossible or future dates", () => {
    expect(ageOn("2010-02-30", today)).toBeNull();
    expect(ageOn("2027-01-01", today)).toBeNull();
  });
  it("requires a separate parent email under 16", () => {
    expect(signupAgeProblem({ dob: "2013-05-01", parentEmail: "", email: "kid@x.be" }, today)).toBe("parent_email_required");
    expect(signupAgeProblem({ dob: "2013-05-01", parentEmail: "kid@x.be", email: "kid@x.be" }, today)).toBe("parent_email_same");
    expect(signupAgeProblem({ dob: "2013-05-01", parentEmail: "mama@x.be", email: "kid@x.be" }, today)).toBeNull();
    expect(signupAgeProblem({ dob: "1990-05-01", parentEmail: "", email: "a@x.be" }, today)).toBeNull();
  });
  it("blocks anonymous visitors at the minor default level", () => {
    expect(canSendQuestion("verified_only", { signedIn: false, verified: false })).toBe(false);
    expect(canSendQuestion("verified_only", { signedIn: true, verified: true })).toBe(true);
    expect(canSendQuestion("members_only", { signedIn: true, verified: false })).toBe(true);
    expect(canSendQuestion("disabled", { signedIn: true, verified: true })).toBe(false);
    expect(canSendQuestion("public_unrestricted", { signedIn: false, verified: false })).toBe(true);
  });
});
