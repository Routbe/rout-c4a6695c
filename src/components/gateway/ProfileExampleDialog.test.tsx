import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProfileExampleDialog } from "./ProfileExampleDialog";

vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ locale: "nl" }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("homepage previews cannot create transactions", () => {
  it("reviews an appointment locally without sending booking data", () => {
    const network = vi.fn(() => Promise.reject(new Error("No network in example")));
    vi.stubGlobal("fetch", network);
    render(<ProfileExampleDialog action="booking" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "17:00" }));
    expect(screen.getByRole("button", { name: "17:00" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Bekijk je afspraak" }));
    expect(network).not.toHaveBeenCalled();
  });
  it("reviews a donation locally without starting a payment", () => {
    const network = vi.fn(() => Promise.reject(new Error("No network in example")));
    vi.stubGlobal("fetch", network);
    render(<ProfileExampleDialog action="support" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "€25" }));
    fireEvent.click(screen.getByRole("button", { name: "Overschrijving" }));
    expect(screen.getByRole("button", { name: "Overschrijving" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Bekijk je bijdrage" }));
    expect(network).not.toHaveBeenCalled();
  });
});