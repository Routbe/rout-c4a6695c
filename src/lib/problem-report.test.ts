import { describe, expect, it } from "vitest";
import { problemReportHref, readProblemReport, PROBLEM_REPORT_MAX } from "./problem-report";

describe("problem report link", () => {
  it("round-trips the page and error message into a bug report", () => {
    const href = problemReportHref({ name: "TypeError", message: "x is undefined" }, "/studio", new Date("2026-11-02T17:00:00Z"));
    const text = readProblemReport(href.split("?")[1]!)!;
    expect(text).toContain("Pagina: /studio");
    expect(text).toContain("TypeError: x is undefined");
  });
  it("caps very long stacks", () => {
    const href = problemReportHref({ message: "a", stack: "s".repeat(5000) }, "/");
    expect(readProblemReport(href.split("?")[1]!)!.length).toBeLessThanOrEqual(PROBLEM_REPORT_MAX);
  });
  it("ignores links that are not bug reports", () => {
    expect(readProblemReport("topic=general&report=hi")).toBeNull();
  });
});
