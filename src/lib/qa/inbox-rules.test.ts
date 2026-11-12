import { describe, expect, it } from "vitest";
import { UNDO_DELETE_MS, answerRatio, filterInbox, mergeNewest } from "./inbox-rules";

const items = [
  { id: "a", answer: null },
  { id: "b", answer: "yes" },
  { id: "c", answer: null },
];

describe("inbox rules", () => {
  it("Onbeantwoord shows only questions without an answer", () => {
    expect(filterInbox(items, "open", new Set()).map((i) => i.id)).toEqual(["a", "c"]);
  });
  it("Beantwoord shows only answered questions", () => {
    expect(filterInbox(items, "answered", new Set()).map((i) => i.id)).toEqual(["b"]);
  });
  it("a question waiting for undo is hidden in every filter", () => {
    expect(filterInbox(items, "all", new Set(["a"])).map((i) => i.id)).toEqual(["b", "c"]);
  });
  it("undo window is 5 seconds", () => {
    expect(UNDO_DELETE_MS).toBe(5000);
  });
  it("new arrivals go on top without duplicates", () => {
    expect(mergeNewest([{ id: "n" }, { id: "a" }], [{ id: "a" }, { id: "b" }]).map((i) => i.id)).toEqual(["n", "a", "b"]);
  });
  it("answer ratio is a whole percentage", () => {
    expect(answerRatio(1, 3)).toBe(33);
    expect(answerRatio(0, 0)).toBeNull();
  });
});
