import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeaderControl, HeaderControls } from "./HeaderControls";
import { Button } from "@/components/ui/button";

describe("header controls", () => {
  it("pointer exploration never activates an action", () => {
    const action = vi.fn();
    const { unmount } = render(<HeaderControls><HeaderControl name="invite"><Button onClick={action}>Invite</Button></HeaderControl><HeaderControl name="account"><Button onClick={action}>Account</Button></HeaderControl></HeaderControls>);
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Invite" }));
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Account" }));
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(action).toHaveBeenCalledTimes(1);
    unmount();
  });
});