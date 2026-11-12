import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuItem, SpatialDropdownMenuContent } from "./dropdown-menu";

function Fixture() {
  const [open, setOpen] = useState(false);
  return <DropdownMenu open={open} onOpenChange={setOpen}><DropdownMenuTrigger>Account</DropdownMenuTrigger><SpatialDropdownMenuContent open={open}><DropdownMenuItem>Profiel</DropdownMenuItem></SpatialDropdownMenuContent></DropdownMenu>;
}

describe("spatial menu keyboard lifecycle", () => {
  it("opens with the keyboard and closes on Escape without losing trigger focus", async () => {
    const { unmount } = render(<Fixture />);
    const trigger = screen.getByRole("button", { name: "Account" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    const item = await screen.findByRole("menuitem", { name: "Profiel" });
    fireEvent.keyDown(item, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
    await waitFor(() => expect(trigger).toHaveFocus());
    unmount();
  });
});