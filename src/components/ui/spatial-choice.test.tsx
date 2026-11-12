import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpatialChoice } from "./spatial-choice";

afterEach(cleanup);
describe("controlled spatial selection", () => {
  it("hover never commits a selection", () => {
    const change = vi.fn();
    render(<SpatialChoice value="online" label="Presence" onChange={change} options={[{ value: "online", label: "Online" }, { value: "offline", label: "Offline" }]} />);
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Offline" }));
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Offline" }));
    expect(change).toHaveBeenCalledWith("offline");
  });
  it("disabled choices cannot invoke a status update", () => {
    const change = vi.fn();
    render(<SpatialChoice value="online" label="Presence" onChange={change} disabled options={[{ value: "online", label: "Online" }, { value: "offline", label: "Offline" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Offline" }));
    expect(change).not.toHaveBeenCalled();
  });
  it("keyboard navigation skips unavailable destinations", () => {
    const change = vi.fn();
    render(<SpatialChoice role="tablist" value="content" label="Studio" onChange={change} options={[{ value: "content", label: "Content" }, { value: "design", label: "Design", disabled: true }, { value: "identity", label: "Identity" }]} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Content" }), { key: "ArrowRight" });
    expect(change).toHaveBeenCalledWith("identity");
    expect(screen.getByRole("tab", { name: "Identity" })).toHaveFocus();
  });
});