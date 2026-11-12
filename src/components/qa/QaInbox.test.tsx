import type React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fns = vi.hoisted(() => ({
  getMyQuestions: vi.fn(),
  getMyNewQuestions: vi.fn(async () => ({ questions: [] })),
  getMyQaInsights: vi.fn(async () => ({ ready: true, week: 2, total: 3, answered: 1 })),
  getMyQaOwners: vi.fn(async () => ({ owners: {} })),
  answerMyQuestion: vi.fn(),
  deleteMyQuestion: vi.fn(async () => ({ ok: true })),
  muteSenderOfQuestion: vi.fn(),
  unpublishMyQuestion: vi.fn(),
}));
const toasts = vi.hoisted(() => ({ last: null as null | { onClick: () => void } }));

vi.mock("@/lib/questions.functions", () => fns);
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ locale: "nl", t: (k: string) => k }) }));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, onSelect, disabled }: { children: React.ReactNode; onSelect?: () => void; disabled?: boolean }) => (
    <button type="button" role="menuitem" disabled={disabled} onClick={() => onSelect?.()}>{children}</button>
  ),
}));
vi.mock("sonner", () => {
  const toast = Object.assign(
    vi.fn((_m: string, o?: { action?: { onClick: () => void } }) => { toasts.last = o?.action ?? null; }),
    { success: vi.fn(), error: vi.fn() },
  );
  return { toast };
});

import { QaInbox } from "./QaInbox";

const q = (id: string, answer: string | null, at: string) => ({
  id, space: "root", body: `vraag ${id}`, prompt: null, answer, published: false, styleMasked: false, arrivedAt: at, answeredAt: null, storyUntil: null,
});

function renderInbox() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><QaInbox space="root" /></QueryClientProvider>);
}

async function openMenuAndDelete(body: string) {
  const card = screen.getByText(body).closest("li")!;
  const item = [...card.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent?.includes("pages.qa.inbox.delete"))!;
  fireEvent.click(item);
}

beforeEach(() => {
  fns.getMyQuestions.mockResolvedValue({
    ready: true, enabled: true, next: null,
    questions: [q("a", null, "2026-11-03T07:00:00.000Z"), q("b", "ja", "2026-11-03T06:00:00.000Z"), q("c", null, "2026-11-03T05:00:00.000Z")],
  });
  fns.deleteMyQuestion.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Void Inbox", () => {
  it("Onbeantwoord filters locally without asking the server again", async () => {
    renderInbox();
    await screen.findByText("vraag a");
    const calls = fns.getMyQuestions.mock.calls.length;
    fireEvent.click(screen.getByRole("tab", { name: "pages.qa.inbox.filter.open" }));
    expect(screen.queryByText("vraag b")).toBeNull();
    expect(screen.getByText("vraag c")).toBeTruthy();
    expect(fns.getMyQuestions.mock.calls.length).toBe(calls);
  });

  it("shows questions this week and the answer ratio", async () => {
    renderInbox();
    expect(await screen.findByText("33%")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("undo within 5 seconds restores the question and never deletes it", async () => {
    renderInbox();
    await screen.findByText("vraag a");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await openMenuAndDelete("vraag a");
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(screen.queryByText("vraag a")).toBeNull();
    act(() => toasts.last?.onClick());
    await act(async () => { vi.advanceTimersByTime(6000); });
    expect(screen.getByText("vraag a")).toBeTruthy();
    expect(fns.deleteMyQuestion).not.toHaveBeenCalled();
  });

  it("without undo the question is deleted once, after 5 seconds", async () => {
    renderInbox();
    await screen.findByText("vraag c");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await openMenuAndDelete("vraag c");
    await act(async () => { vi.advanceTimersByTime(4900); });
    expect(fns.deleteMyQuestion).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(200); });
    await waitFor(() => expect(fns.deleteMyQuestion).toHaveBeenCalledTimes(1));
    expect(fns.deleteMyQuestion).toHaveBeenCalledWith({ data: { id: "c" } });
  });
});
