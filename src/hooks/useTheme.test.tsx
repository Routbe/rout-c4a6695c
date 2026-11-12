import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INTERFACE_THEME_KEY } from "@/lib/internal-interface-theme";
const location = vi.hoisted(() => ({ path: "/studio", routes: ["/studio"] }));
vi.mock("@tanstack/react-router", () => ({
  useMatches: ({ select }: { select: (matches: { routeId: string }[]) => unknown }) => select(location.routes.map(routeId => ({ routeId }))),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => unknown }) => select({ location: { pathname: location.path } }),
}));
import { ThemeProvider, useTheme } from "./useTheme";
function Controls() {
  const { interfaceTheme, setInterfaceTheme } = useTheme();
  return <><output>{interfaceTheme}</output><button onClick={() => setInterfaceTheme("glass")}>Creator</button><button onClick={() => setInterfaceTheme("mechanical")}>Sovereign</button></>;
}
describe("workspace material preference lifecycle", () => {
  beforeEach(() => {
    localStorage.clear(); location.path = "/studio"; location.routes = ["/studio"];
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("switches live, persists Creator and restores it after reopening", async () => {
    const view = render(<ThemeProvider><Controls /></ThemeProvider>);
    await waitFor(() => expect(document.documentElement.dataset["theme"]).toBe("mechanical"));
    fireEvent.click(screen.getByRole("button", { name: "Creator" }));
    expect(localStorage.getItem(INTERFACE_THEME_KEY)).toBe("glass");
    expect(document.documentElement.dataset["theme"]).toBe("glass");
    view.unmount();
    render(<ThemeProvider><Controls /></ThemeProvider>);
    await waitFor(() => expect(document.documentElement.dataset["theme"]).toBe("glass"));
  });
  it("removes the engine on the homepage while keeping the member choice", async () => {
    localStorage.setItem(INTERFACE_THEME_KEY, "glass");
    const view = render(<ThemeProvider><Controls /></ThemeProvider>);
    await waitFor(() => expect(document.documentElement.dataset["theme"]).toBe("glass"));
    location.path = "/"; location.routes = ["/"];
    view.rerender(<ThemeProvider><Controls /></ThemeProvider>);
    expect(document.documentElement.hasAttribute("data-workspace-ui")).toBe(false);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(localStorage.getItem(INTERFACE_THEME_KEY)).toBe("glass");
  });
  it("synchronizes another tab and falls back to Mechanical on clearing storage", async () => {
    render(<ThemeProvider><Controls /></ThemeProvider>);
    localStorage.setItem(INTERFACE_THEME_KEY, "glass");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: INTERFACE_THEME_KEY, newValue: "glass" })));
    expect(document.documentElement.dataset["theme"]).toBe("glass");
    localStorage.clear();
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null, newValue: null })));
    expect(document.documentElement.dataset["theme"]).toBe("mechanical");
  });
});