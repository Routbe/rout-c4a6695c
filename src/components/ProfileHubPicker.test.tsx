import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileQrDesignContext, toProfileQrStyle } from "@/lib/qr-design-bridge";

const { save, load } = vi.hoisted(() => ({ save: vi.fn(), load: vi.fn() }));
vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-start")>(),
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@/lib/qr-settings.functions", () => ({ saveQrSettingsFn: save, saveWorkspaceQrSettingsFn: vi.fn(), getQrSettingsFn: vi.fn(async () => null), getWorkspaceQrSettingsFn: vi.fn(async () => null) }));
vi.mock("@/lib/workspaces.functions", () => ({ getWorkspaceContext: async () => ({ workspaces: [] }) }));
vi.mock("@/lib/workspace-studio.functions", () => ({ getWorkspaceStudioProfile: vi.fn() }));
vi.mock("@/lib/studio-profile.functions", () => ({ getStudioProfile: load }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/router-compat", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { ProfileHubPicker } from "./ProfileHubPicker";

describe("profile QR designer save handoff", () => {
  beforeEach(() => { save.mockReset().mockResolvedValue({ ok: true }); load.mockReset().mockResolvedValue({ username: "owner", verified: true, status: "active" }); });
  afterEach(cleanup);

  it("saves the latest rendered design, preserving fill and logo without a default emblem", async () => {
    const client = new QueryClient();
    const first = toProfileQrStyle({ fgColor: "#112233", bgColor: "#ffffff", dotStyle: "square" });
    const selected = toProfileQrStyle({ fgColor: "#223344", bgColor: "transparent", bgGradient: "linear-gradient(135deg, #ffffff, #112233)", dotStyle: "classy", logo: "data:image/png;base64,AAAA", logoSize: 0.3 });
    const view = (style: typeof first) => <QueryClientProvider client={client}><ProfileQrDesignContext.Provider value={style}><ProfileHubPicker values={{}} onChange={vi.fn()} /></ProfileQrDesignContext.Provider></QueryClientProvider>;
    const mounted = render(view(first));
    await screen.findByRole("button", { name: "Opslaan" });
    mounted.rerender(view(selected));
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ data: selected }));
    expect(save.mock.calls[0]?.[0]?.data).toMatchObject({ emblem: false, bgColor: "transparent", logoSize: 0.3, dotStyle: "classy" });
  });

  it("refuses to save when no active designer supplies a design", async () => {
    render(<QueryClientProvider client={new QueryClient()}><ProfileHubPicker values={{}} onChange={vi.fn()} /></QueryClientProvider>);
    const button = await screen.findByRole("button", { name: "Opslaan" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps separate mounted designers isolated", async () => {
    const first = toProfileQrStyle({ fgColor: "#112233", bgColor: "#ffffff", dotStyle: "dots" });
    const second = toProfileQrStyle({ fgColor: "#445566", bgColor: "#eeeeee", dotStyle: "classy" });
    render(<QueryClientProvider client={new QueryClient()}>{[first, second].map((style, index) => <ProfileQrDesignContext.Provider key={index} value={style}><ProfileHubPicker values={{}} onChange={vi.fn()} /></ProfileQrDesignContext.Provider>)}</QueryClientProvider>);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Opslaan" })).toHaveLength(2));
    const button = screen.getAllByRole("button", { name: "Opslaan" })[0];
    if (!button) throw new Error("missing first save control");
    fireEvent.click(button);
    await waitFor(() => expect(save).toHaveBeenCalledWith({ data: first }));
    expect(save).not.toHaveBeenCalledWith({ data: second });
  });
});