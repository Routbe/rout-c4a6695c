import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn, createServerFn: () => ({ middleware: () => ({ inputValidator: () => ({ handler: () => () => undefined }) }), inputValidator: () => ({ handler: () => () => undefined }) }) }));
vi.mock("@/lib/visual-widgets.functions", () => ({
  getWidgetWeather: vi.fn(async () => ({ ok: true, temperature: 12.4, code: 61, wind: 18, isDay: true, fetchedAt: 0 })),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k), i18n: { language: "nl" } }),
}));

import { VisualWidgetCard } from "./VisualWidgetCard";

const wrap = (node: ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
const gent = { name: "Gent", lat: 51.05, lon: 3.72, timezone: "Europe/Brussels" };

describe("VisualWidgetCard", () => {
  it("renders nothing until the widget is configured", () => {
    const { container } = wrap(<VisualWidgetCard kind="wg_weather" label="Weer" value="{}" />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the weather for the shared city", async () => {
    wrap(<VisualWidgetCard kind="wg_weather" label="Weer" value={JSON.stringify({ place: gent })} />);
    expect(await screen.findByText("12°")).toBeTruthy();
    expect(screen.getByText("Gent")).toBeTruthy();
    expect(screen.getByText("profile.vw.weather.Rain")).toBeTruthy();
  });

  it("does not load a third-party video until the visitor taps", () => {
    const { container } = wrap(<VisualWidgetCard kind="wg_video" label="Clip" value={JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" })} />);
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(container.querySelector("iframe")?.getAttribute("src")).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("renders formatted text safely", () => {
    wrap(<VisualWidgetCard kind="wg_text" label="Over mij" value={JSON.stringify({ text: "Hallo **wereld** <script>x</script>" })} />);
    expect(screen.getByText("wereld").tagName).toBe("STRONG");
    expect(document.querySelector("script")).toBeNull();
  });

  it("shows the map at city level only", () => {
    const { container } = wrap(<VisualWidgetCard kind="wg_map" label="Kaart" value={JSON.stringify({ place: gent, zoom: 10 })} />);
    expect(container.querySelector("iframe")?.getAttribute("src")).toContain("openstreetmap.org/export/embed.html");
  });
});
