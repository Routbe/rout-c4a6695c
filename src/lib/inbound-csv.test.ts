import { describe, expect, it } from "vitest";
import { INBOUND_CSV_COLUMNS, inboundCsvRows, type InboundExportRow } from "./payments";
import { toCsv } from "./csv";

const row = (over: Partial<InboundExportRow> = {}): InboundExportRow => ({
  eventId: "inbound:ROUT-1001",
  reference: "ROUT-1001",
  receivedAt: "2026-08-01T10:00:00.000Z",
  matched: true,
  status: "paid",
  amountCents: 2500,
  donationCents: 500,
  username: "jona",
  email: "jona@example.com",
  ...over,
});

describe("inbound payments CSV export", () => {
  it("exports exactly the rows passed in (the filtered table view)", () => {
    const rows = inboundCsvRows([row(), row({ reference: "ROUT-1002" })]);
    expect(rows).toHaveLength(2);
    const csv = toCsv(rows, [...INBOUND_CSV_COLUMNS]);
    expect(csv.split("\r\n")).toHaveLength(3); // header + 2 rows
  });

  it("emits every required column in a fixed order", () => {
    const csv = toCsv(inboundCsvRows([row()]), [...INBOUND_CSV_COLUMNS]);
    expect(csv.split("\r\n")[0]).toBe(
      "Payment ID,Timestamp,Amount,Currency,Parsed Reference,Matched User,Status,Error Reason",
    );
    expect(Object.keys(inboundCsvRows([row()])[0])).toEqual([...INBOUND_CSV_COLUMNS]);
  });

  it("sums amount and donation into a decimal EUR value", () => {
    const [r] = inboundCsvRows([row()]);
    expect(r.Amount).toBe("30.00");
    expect(r.Currency).toBe("EUR");
  });

  it("leaves amount and currency empty when nothing was parsed", () => {
    const [r] = inboundCsvRows([row({ amountCents: null, donationCents: null })]);
    expect(r.Amount).toBe("");
    expect(r.Currency).toBe("");
  });

  it("marks unmatched references and includes the failure reason", () => {
    const [r] = inboundCsvRows([row({ matched: false, status: null, username: null })]);
    expect(r.Status).toBe("unmatched");
    expect(r["Matched User"]).toBe("jona@example.com");
    expect(r["Error Reason"]).toContain("No verification payment exists");
  });

  it("has no error reason for a fully paid row", () => {
    expect(inboundCsvRows([row()])[0]["Error Reason"]).toBe("");
  });

  it("neutralises spreadsheet formula injection in user-controlled cells", () => {
    const csv = toCsv(inboundCsvRows([row({ username: null, email: "=cmd|'/c calc'!A1" })]), [
      ...INBOUND_CSV_COLUMNS,
    ]);
    expect(csv).toContain("'=cmd");
  });
});
