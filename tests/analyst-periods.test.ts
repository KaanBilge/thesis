import { describe, expect, it } from "vitest";
import { deriveFinancialPeriod } from "../src/analyst/periods";
const row = (id: string, start: string, end: string, value: number) => ({ id, concept: "Operating cash flow", unit: "USD millions", periodStart: start, periodEnd: end, value, sourceIds: ["S1"] });
const reconciliation = "Fictional comparable cash flows from the same restated accounts.";
describe("reported-period calculations", () => {
  it("derives a discrete quarter from two compatible cumulative cash-flow amounts", () => {
    const result = deriveFinancialPeriod({ operation: "subtract-ytd", reconciliation, observations: [row("Q2", "2025-01-01", "2025-06-30", 70), row("Q1", "2025-01-01", "2025-03-31", 30)] });
    expect(result).toMatchObject({ value: 40, periodStart: "2025-04-01", periodEnd: "2025-06-30", days: 91, formula: "Q2 - Q1", periodDescription: "approximately_quarterly" });
  });
  it("sums non-calendar consecutive quarters and rejects overlapping YTD instead of fabricating TTM", () => {
    const observations = [row("Q1", "2024-10-01", "2024-12-31", 10), row("Q2", "2025-01-01", "2025-03-31", 20), row("Q3", "2025-04-01", "2025-06-30", 30), row("Q4", "2025-07-01", "2025-09-30", 40)];
    expect(deriveFinancialPeriod({ operation: "sum-contiguous", observations, reconciliation })).toMatchObject({ value: 100, days: 365, periodDescription: "approximately_annual" });
    observations[1].periodStart = "2024-10-01";
    expect(() => deriveFinancialPeriod({ operation: "sum-contiguous", observations, reconciliation })).toThrow("overlap");
  });
  it("rejects mismatched units, gaps, and incompatible YTD starting dates", () => {
    const observations = [row("A", "2025-01-01", "2025-03-31", 10), row("B", "2025-04-02", "2025-06-30", 20)];
    expect(() => deriveFinancialPeriod({ operation: "sum-contiguous", observations, reconciliation })).toThrow("gap");
    expect(() => deriveFinancialPeriod({ operation: "subtract-ytd", observations, reconciliation })).toThrow("common fiscal start");
    observations[1].unit = "EUR millions";
    expect(() => deriveFinancialPeriod({ operation: "subtract-ytd", observations, reconciliation })).toThrow("Normalize");
  });
});
