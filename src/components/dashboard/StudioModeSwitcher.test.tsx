import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
import { StudioModeSwitcher } from "./StudioModeSwitcher";

describe("editable page destinations", () => {
  it("hides the switch when only the profile is available", () => {
    const { container } = render(<StudioModeSwitcher mode="profile" enabled={false} handle="anna" onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("switches to the available tip page", () => {
    const change = vi.fn();
    const { unmount } = render(<StudioModeSwitcher mode="profile" enabled handle="anna" onChange={change} />);
    fireEvent.click(screen.getByRole("tab", { name: /studio.mode.tip/ }));
    expect(change).toHaveBeenCalledWith("tip");
    unmount();
  });
  it("retains an exit from a tip page that has just been disabled", () => {
    const change = vi.fn();
    render(<StudioModeSwitcher mode="tip" enabled={false} handle="anna" onChange={change} />);
    fireEvent.click(screen.getByRole("tab", { name: /studio.mode.profile/ }));
    expect(change).toHaveBeenCalledWith("profile");
  });
  it("hovering another destination never switches the selected page", () => {
    const change = vi.fn();
    const { unmount } = render(<StudioModeSwitcher mode="profile" enabled handle="anna" onChange={change} />);
    fireEvent.pointerEnter(screen.getAllByRole("tab", { name: /studio.mode.tip/ }).at(-1) as HTMLElement);
    expect(change).not.toHaveBeenCalled();
    unmount();
  });
});