import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ enqueue: vi.fn(), list: vi.fn(), ticket: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => ({
  "omni.url": "Content-URL", "omni.import": "Link importeren",
  "omni.processing": "Import wordt verwerkt", "omni.add": "Kaart toevoegen",
  "omni.refresh": "Inbox vernieuwen",
}[key] ?? key) }) }));
vi.mock("@/lib/omni-ingest.functions", () => ({
  enqueueOmniUrl: mocks.enqueue, listOmniIngestJobs: mocks.list, getOmniRealtimeTicket: mocks.ticket,
  getIngestTokenStatus: async () => ({ active: false }), rotateIngestToken: vi.fn(), revokeIngestToken: vi.fn(), dismissOmniJob: vi.fn(), retryOmniJob: vi.fn(),
}));
import { OmniIngestPanel } from "./OmniIngestPanel";
const job = { id: "11111111-1111-4111-8111-111111111111", source: "studio", sourceUrl: "https://example.com/story", status: "ready", contentType: "article", title: "Imported story", metaTag: "5 min", targetUrl: "https://example.com/story", mediaUrl: "/api/public/gallery-media?path=22222222-2222-4222-8222-222222222222%2Fomni-cover.webp", kineticPreviewUrl: null, error: null, createdAt: "2026-11-03T00:00:00Z" };
beforeEach(() => { mocks.enqueue.mockReset(); mocks.list.mockReset(); mocks.ticket.mockReset(); mocks.list.mockResolvedValue([]); mocks.ticket.mockResolvedValue({ configured: false }); });
function mount(onAdd = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { ...render(<QueryClientProvider client={client}><OmniIngestPanel full={false} onAdd={onAdd} /></QueryClientProvider>), onAdd };
}
it("shows the accepted request immediately but changes the private draft only on explicit add", async () => {
  let accept: (value: unknown) => void = () => {};
  mocks.enqueue.mockImplementation(() => new Promise((resolve) => { accept = resolve; }));
  const view = mount();
  await waitFor(() => expect(mocks.list).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText("Content-URL"), { target: { value: "https://example.com/story" } });
  fireEvent.click(screen.getByRole("button", { name: "Link importeren" }));
  await waitFor(() => expect(screen.getByRole("status", { name: "Import wordt verwerkt" })).toBeTruthy());
  expect(view.onAdd).not.toHaveBeenCalled();
  mocks.list.mockResolvedValue([job]);
  await act(async () => { accept({ ok: true, jobId: job.id }); });
  fireEvent.click(await screen.findByRole("button", { name: "Kaart toevoegen" }));
  expect(view.onAdd).toHaveBeenCalledWith(expect.objectContaining({ contentType: "article", mediaUrl: job.mediaUrl, isHero: false }));
  view.unmount();
});
it("SSE completion triggers authenticated readback without periodic polling or automatic publication", async () => {
  const encoder = new TextEncoder(); let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream));
  mocks.ticket.mockResolvedValue({ configured: true, url: "https://events.example.com/events", token: "test-ticket" });
  const view = mount();
  try {
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    mocks.list.mockResolvedValue([job]);
    await act(async () => { controller?.enqueue(encoder.encode('event: job\ndata: {"id":"job"}\n\n')); });
    expect(await screen.findByRole("button", { name: "Kaart toevoegen" })).toBeTruthy();
    expect(view.onAdd).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith("https://events.example.com/events", expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer test-ticket" } }));
  } finally { view.unmount(); controller?.close(); fetch.mockRestore(); }
});
it("keeps accepted jobs visible across stale readback until authoritative completion arrives", async () => {
  mocks.enqueue.mockResolvedValue({ ok: true, jobId: job.id });
  const view = mount();
  await waitFor(() => expect(mocks.list).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText("Content-URL"), { target: { value: job.sourceUrl } });
  fireEvent.click(screen.getByRole("button", { name: "Link importeren" }));
  await waitFor(() => expect(mocks.list.mock.calls.length).toBeGreaterThan(1));
  expect(screen.getByRole("status", { name: "Import wordt verwerkt" })).toBeTruthy();
  mocks.list.mockResolvedValue([job]);
  fireEvent.click(await screen.findByRole("button", { name: "Inbox vernieuwen" }));
  expect(await screen.findByRole("button", { name: "Kaart toevoegen" })).toBeTruthy();
  expect(screen.queryByRole("status", { name: "Import wordt verwerkt" })).toBeNull();
  expect(view.onAdd).not.toHaveBeenCalled();
  view.unmount();
});
it("exposes manual readback when an established stream closes normally", async () => {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; } })));
  mocks.ticket.mockResolvedValue({ configured: true, url: "https://events.example.com/events", token: "test-ticket" });
  const view = mount();
  try {
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await act(async () => { controller?.close(); });
    expect(await screen.findByRole("button", { name: "Inbox vernieuwen" })).toBeTruthy();
  } finally { view.unmount(); fetch.mockRestore(); }
});
it("reconciles completion arriving during an in-flight read without cancelling that read", async () => {
  const encoder = new TextEncoder(); let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; } })));
  mocks.ticket.mockResolvedValue({ configured: true, url: "https://events.example.com/events", token: "test-ticket" });
  const view = mount();
  try {
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    let finishRead: (value: unknown) => void = () => {};
    mocks.list.mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve; }));
    await act(async () => { controller?.enqueue(encoder.encode("event: reconnected\ndata: {}\n\n")); });
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    mocks.list.mockResolvedValue([job]);
    await act(async () => {
      controller?.enqueue(encoder.encode("event: job\ndata: {}\n\n"));
      await Promise.resolve(); finishRead([]);
    });
    expect(await screen.findByRole("button", { name: "Kaart toevoegen" })).toBeTruthy();
    expect(mocks.list).toHaveBeenCalledTimes(3);
    expect(view.onAdd).not.toHaveBeenCalled();
  } finally { view.unmount(); controller?.close(); fetch.mockRestore(); }
});