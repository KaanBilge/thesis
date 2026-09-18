import { describe, expect, it } from "vitest";
import {
  addCalendarMonths, calculateModel, calculateValuation, priceHistoryMetrics, reversePe,
  ValuationInputSchema, type Driver, type ValuationInput, type ValuationModel,
} from "../src/analyst/calculations";

const d = (value: number): Driver => ({ value, kind: "assumption", rationale: "Explicit synthetic test assumption, not company research.", sourceIds: [] });
const bridge = () => ({
  cashAndEquivalents: d(20), debt: d(50), preferredEquity: d(2), nonControllingInterests: d(4),
  otherNonOperatingAssets: d(3), otherClaims: d(1),
  cashTreatment: "excess_non_operating_only" as const,
  shareTreatment: "fully_diluted_no_separate_option_deduction" as const,
});
const common = (valuationDate = "2026-01-31") => ({ valuationDate, rationale: "Synthetic method for independently checked arithmetic.", sourceIds: [] });
const fcff = (): Extract<ValuationModel, { method: "dcf_fcff" }> => ({
  ...common(), method: "dcf_fcff", discountRate: d(0.1), dilutedShares: d(10), bridge: bridge(),
  forecast: [{ year: 1, revenue: d(100), operatingMargin: d(0.2), cashTaxes: d(5), depreciation: d(5), capitalExpenditure: d(10), changeWorkingCapital: d(0) }],
  terminal: { growth: d(0.02), operatingMargin: d(0.2), taxRate: d(0.25), returnOnCapital: d(0.1) },
  sensitivity: { discountRates: [d(0.09), d(0.11)], terminalGrowths: [d(0.01), d(0.03)] },
});
const fcfe = (): Extract<ValuationModel, { method: "fcfe" }> => ({
  ...common(), method: "fcfe", costOfEquity: d(0.1), dilutedShares: d(10),
  forecast: [{ year: 1, netIncomeToCommon: d(10), equityReinvestment: d(2) }],
  terminal: { growth: d(0.02), returnOnEquity: d(0.1) },
  commonEquityCashFlows: "after_interest_and_preferred_distributions",
  sensitivity: { discountRates: [d(0.09), d(0.11)], terminalGrowths: [d(0.01), d(0.03)] },
});
const pe = (valuationDate = "2027-01-31", earnings = 2, multiple = 10): Extract<ValuationModel, { method: "pe" }> => ({
  ...common(valuationDate), method: "pe", earningsPerShare: d(earnings), multiple: d(multiple),
  earningsBasis: "forward_12_months", earningsPeriodEnd: addCalendarMonths(valuationDate, 12), shareTreatment: "fully_diluted_eps",
});
function fixture(): ValuationInput {
  return {
    schemaVersion: 1, ticker: "TEST", asOf: "2026-01-31T20:00:00Z", horizonMonths: 12, businessType: "operating",
    units: { currency: "USD", priceCurrency: "USD", financialScale: "millions", shareScale: "millions" },
    sources: [{ id: "fixture", title: "Synthetic fixture", url: "https://example.com/synthetic-fixture", availableAt: "2026-01-31T19:00:00Z" }],
    marketPrice: { value: 10, kind: "observed", rationale: "Synthetic fixture price", sourceIds: ["fixture"], observedAt: "2026-01-31T19:00:00Z" },
    entryPolicy: { requiredAnnualReturn: d(0.1), marginOfSafety: d(0.2) },
    scenarios: (["bear", "base", "bull"] as const).map((name, i) => ({ name, fairValue: fcff(), horizonValue: pe("2027-01-31", 1 + i), dividends: [], horizonDistributionTreatment: "ex_dividend" })),
  };
}

describe("independently checked valuation arithmetic", () => {
  it("computes FCFF with reinvestment, terminal ROC and each equity bridge claim exactly once", () => {
    const result = calculateModel(fcff());
    // EBIT 20 - cash taxes 5 - (capex 10 - D&A 5 + WC 0) = 10.
    // Terminal FCFF = 100*1.02*.2*.75*(1-.02/.1) = 12.24.
    // EV=(10+12.24/(.1-.02))/1.1=148.181818; bridge=20+3-50-2-4-1=-34.
    expect(result.cashFlows![0].cashFlow).toBe(10);
    expect(result.terminal!.cashFlow).toBeCloseTo(12.24, 12);
    expect(result.terminal!.valueAtForecastEnd).toBeCloseTo(153, 12);
    expect(result.enterpriseValue).toBeCloseTo(148.181818181818, 10);
    expect(result.rawEquityValue).toBeCloseTo(114.181818181818, 10);
    expect(result.perShareValue).toBeCloseTo(11.4181818181818, 10);
    expect(result.netDebt).toBe(30);
    expect(result.sensitivity![0].perShareValue).toBeGreaterThan(result.perShareValue!);
    expect(result.sensitivity![1].perShareValue).toBeLessThan(result.perShareValue!);
    expect(result.warnings.some(w => w.includes("75%"))).toBe(true);
  });

  it("discounts two explicit yearly cash flows and terminal value at the right dates", () => {
    const input = fcff();
    input.forecast.push({ ...input.forecast[0], year: 2 });
    const result = calculateModel(input);
    expect(result.enterpriseValue).toBeCloseTo(10 / 1.1 + 163 / 1.1 ** 2, 10);
  });
  it("recomputes terminal income and reinvestment across the discount-rate/growth grid", () => {
    const result = calculateModel(fcff());
    expect(result.terminalGrowthSensitivity).toHaveLength(4);
    const point = result.terminalGrowthSensitivity!.find(p => p.discountRate === 0.09 && p.terminalGrowth === 0.01)!;
    expect(point.rawEquityValue).toBeCloseTo((10 + 13.635 / 0.08) / 1.09 - 34, 10);
    const bad = fcff(); bad.sensitivity.terminalGrowths = [d(0.01), d(0.095)];
    expect(() => calculateModel(bad)).toThrow("grid point");
  });

  it("handles a net-cash company without requiring negative gross debt", () => {
    const input = fcff(); input.bridge.debt = d(5);
    const result = calculateModel(input);
    expect(result.netDebt).toBe(-15);
    expect(result.rawEquityValue).toBeCloseTo(159.181818181818, 10);
  });

  it("uses modified FCFE for a bank with regulatory reinvestment and no debt bridge", () => {
    const input = fixture(); input.businessType = "bank";
    input.scenarios.forEach(s => { s.fairValue = fcfe(); });
    const result = calculateValuation(input).scenarios[1].fairValue;
    // FCFE1=8; terminal=10*1.02*(1-.02/.1)/(.1-.02)=102; equity=(8+102)/1.1=100.
    expect(result.rawEquityValue).toBeCloseTo(100, 12);
    expect(result.perShareValue).toBeCloseTo(10, 12);
    expect(result.enterpriseValue).toBeNull();
    expect(result.netDebt).toBeUndefined();
  });

  it("keeps an EV multiple bridge separate from P/E equity pricing", () => {
    const result = calculateModel({
      ...common(), method: "ev_multiple", metric: "ebitda", metricValue: d(20), multiple: d(8),
      metricBasis: "normalized_annual", metricPeriodEnd: "2026-12-31", leaseTreatment: "debt_and_metric_consistent",
      bridge: bridge(), dilutedShares: d(10),
    });
    expect(result.enterpriseValue).toBe(160);
    expect(result.rawEquityValue).toBe(126);
    expect(result.perShareValue).toBe(12.6);
    const direct = calculateModel(pe("2026-01-31", 2, 8));
    expect(direct.perShareValue).toBe(16);
    expect(direct.rawEquityValue).toBeNull();
    expect(() => calculateModel({ ...pe(), bridge: bridge() })).toThrow();
  });

  it("retains negative raw common equity without inventing a negative stock price or entry", () => {
    const input = fixture();
    const distressed = fcff(); distressed.bridge.debt = d(500);
    input.scenarios[0].fairValue = distressed;
    const result = calculateValuation(input).scenarios[0];
    expect(result.fairValue.rawEquityValue).toBeLessThan(0);
    expect(result.fairValue.perShareValue).toBeNull();
    expect(result.fairValue.status).toBe("nonpositive_common_equity");
    expect(result.entry.entryCeiling).toBeNull();
  });
});

describe("dated horizon, dividends and reverse expectations", () => {
  it("defaults to twelve months and clamps month ends", () => {
    expect(addCalendarMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(addCalendarMonths("2023-08-31", 6)).toBe("2024-02-29");
    const input: Partial<ValuationInput> = fixture(); delete input.horizonMonths;
    expect(ValuationInputSchema.parse(input).horizonMonths).toBe(12);
  });

  it("separates present fair value from a nine-month target and discounts timed dividends", () => {
    const input = fixture(); input.horizonMonths = 9;
    input.scenarios.forEach(s => {
      s.fairValue = pe("2026-01-31", 10, 10); // Present value 100.
      s.horizonValue = pe("2026-10-31", 2, 10); // Nine-month price 20.
      s.dividends = [{ monthsFromAsOf: 3, perShare: d(1) }, { monthsFromAsOf: 9, perShare: d(1) }];
    });
    const result = calculateValuation(input);
    const base = result.scenarios[1];
    expect(result.horizonDate).toBe("2026-10-31");
    expect(base.fairValue.perShareValue).toBe(100);
    expect(base.horizonValue.perShareValue).toBe(20);
    expect(base.returns.priceReturn).toBe(1);
    expect(base.returns.totalReturn).toBeCloseTo(1.2, 12);
    expect(base.returns.annualizedTotalReturn).toBeCloseTo(2.2 ** (12 / 9) - 1, 12);
    expect(base.entry.returnRequiredCeiling).toBeCloseTo(21 / 1.1 ** 0.75 + 1 / 1.1 ** 0.25, 12);
    expect(base.entry.marginOfSafetyCeiling).toBe(80);
    expect(base.entry.entryCeiling).toBe(base.entry.returnRequiredCeiling);
    expect(base.reverseValuation!.requiredHorizonEarningsPerShare).toBeCloseTo((10 * 1.1 ** 0.75 - 1.1 ** 0.5 - 1) / 10, 12);
  });

  it("applies the tighter margin of safety constraint instead of adding discounts together", () => {
    const result = calculateValuation(fixture()).scenarios[1];
    expect(result.entry.entryCeiling).toBeCloseTo(11.4181818181818 * 0.8, 10);
  });

  it("solves reverse P/E earnings algebraically and labels conditional expectations", () => {
    const result = reversePe({ marketPrice: d(100), multiple: d(20), horizonMonths: 12, requiredAnnualReturn: d(0.1), dividends: [{ monthsFromAsOf: 12, perShare: d(2) }], currentEarningsPerShare: d(5) });
    expect(result.currentImpliedEarningsPerShare).toBe(5);
    expect(result.requiredExDividendPrice).toBeCloseTo(108, 12);
    expect(result.requiredHorizonEarningsPerShare).toBeCloseTo(5.4, 12);
    expect(result.requiredEarningsGrowth).toBeCloseTo(0.08, 12);
    expect(result.warnings.join(" ")).toContain("not market consensus");
  });

  it("reports inconsistent scenario ordering without secretly sorting the analyst's values", () => {
    const input = fixture(); input.scenarios[0].horizonValue = pe("2027-01-31", 10);
    const result = calculateValuation(input);
    expect(result.scenarios[0].horizonValue.perShareValue).toBe(100);
    expect(result.warnings.some(w => w.includes("not ordered"))).toBe(true);
  });
});

describe("rejects invalid financial assumptions and broken evidence", () => {
  it.each([0, -1, NaN, Infinity])("rejects diluted shares %s", value => {
    const input = fcff(); input.dilutedShares = d(value);
    expect(() => calculateModel(input)).toThrow();
  });
  it.each([0.02, 0.01])("rejects discount rate %s at or below terminal growth", value => {
    const input = fcff(); input.discountRate = d(value);
    expect(() => calculateModel(input)).toThrow();
  });
  it("requires reinvestment support for terminal growth", () => {
    const input = fcff(); input.terminal.returnOnCapital = d(0.01);
    expect(() => calculateModel(input)).toThrow();
  });
  it("requires annual forecast periods without silent gaps", () => {
    const input = fcff(); input.forecast[0].year = 2;
    expect(() => calculateModel(input)).toThrow();
  });
  it("requires valid sensitivity on both sides of the central discount rate", () => {
    const input = fcff(); input.sensitivity.discountRates = [d(0.11), d(0.12)];
    expect(() => calculateModel(input)).toThrow();
    input.sensitivity.discountRates = [d(0.01), d(0.11)];
    expect(() => calculateModel(input)).toThrow();
  });
  it.each(["bank", "insurance"] as const)("rejects ordinary FCFF for %s", businessType => {
    expect(() => calculateValuation({ ...fixture(), businessType })).toThrow();
  });
  it("rejects another bridge on FCFE", () => { expect(() => calculateModel({ ...fcfe(), bridge: bridge() })).toThrow(); });
  it("rejects negative earnings in a P/E model", () => { expect(() => calculateModel(pe("2026-01-31", -2))).toThrow(); });
  it("rejects silently mismatched money/share scales and currencies", () => {
    const input = fixture(); input.units.shareScale = "units";
    expect(() => calculateValuation(input)).toThrow();
    input.units.shareScale = "millions"; input.units.priceCurrency = "EUR";
    expect(() => calculateValuation(input)).toThrow();
  });
  it.each([5, 19, 12.5])("rejects horizon %s months", horizonMonths => { expect(() => calculateValuation({ ...fixture(), horizonMonths })).toThrow(); });
  it("rejects horizon model or dividend dated beyond the selected horizon", () => {
    const input = fixture(); input.scenarios[0].horizonValue.valuationDate = "2028-01-31";
    expect(() => calculateValuation(input)).toThrow();
    input.scenarios[0].horizonValue.valuationDate = "2027-01-31";
    input.scenarios[0].dividends = [{ monthsFromAsOf: 13, perShare: d(1) }];
    expect(() => calculateValuation(input)).toThrow();
  });
  it("rejects sources unavailable at cutoff, unknown source IDs and observed facts without evidence", () => {
    const input = fixture(); input.sources[0].availableAt = "2026-02-01T00:00:00Z";
    expect(() => calculateValuation(input)).toThrow();
    input.sources[0].availableAt = "2026-01-31T19:00:00Z";
    input.marketPrice.sourceIds = ["missing"];
    expect(() => calculateValuation(input)).toThrow();
    input.marketPrice.sourceIds = [];
    expect(() => calculateValuation(input)).toThrow();
  });
  it("requires an observed market quote with no future observations", () => {
    const input = fixture(); input.marketPrice.kind = "assumption";
    expect(() => calculateValuation(input)).toThrow();
    input.marketPrice.kind = "observed"; input.marketPrice.observedAt = "2026-02-01T00:00:00Z";
    expect(() => calculateValuation(input)).toThrow();
  });
  it("retains driver rationale and source lineage in JSON-serializable results", () => {
    const result = calculateValuation(fixture());
    expect(result.lineage.assumptions.find(a => a.path === "marketPrice")!.sourceIds).toEqual(["fixture"]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
  it("rejects arithmetic overflow instead of serializing Infinity as a missing number", () => {
    expect(() => calculateModel(pe("2026-01-31", Number.MAX_VALUE, 10))).toThrow(/numeric range/);
  });
});

const priceFixture = () => ({
  ticker: "TEST", currency: "USD", asOf: "2026-01-06T20:00:00Z", adjustment: "split_only",
  source: { id: "price-fixture", title: "Synthetic adjusted history", url: "https://example.com/prices", availableAt: "2026-01-05T19:00:00Z" },
  observations: [{ date: "2026-01-01", adjustedClose: 100 }, { date: "2026-01-02", adjustedClose: 120 }, { date: "2026-01-05", adjustedClose: 90 }],
});
describe("honest historical-price metrics", () => {
  it("uses actual month-window dates and withholds unsupported windows", () => {
    const result = priceHistoryMetrics({ ...priceFixture(), asOf: "2026-04-01T20:00:00Z", observations: [
      { date: "2025-03-31", adjustedClose: 80 }, { date: "2025-09-30", adjustedClose: 100 },
      { date: "2025-12-31", adjustedClose: 110 }, { date: "2026-02-27", adjustedClose: 120 },
      { date: "2026-03-31", adjustedClose: 132 },
    ] });
    expect(result.periodReturns.map(p => p.actualStart)).toEqual(["2026-02-27", "2025-12-31", "2025-09-30", "2025-03-31"]);
    result.periodReturns.forEach((p, i) => expect(p.return).toBeCloseTo([0.1, 0.2, 0.32, 0.65][i], 12));
    expect(priceHistoryMetrics(priceFixture()).periodReturns.every(p => p.return === null && p.actualStart === null)).toBe(true);
  });
  it("rejects a daily close whose cutoff-day availability cannot be established", () => {
    expect(() => priceHistoryMetrics({ ...priceFixture(), asOf: "2026-01-05T20:00:00Z" })).toThrow(/must precede/);
    // Just after UTC midnight is still January 5 in New York.
    expect(() => priceHistoryMetrics({ ...priceFixture(), asOf: "2026-01-06T01:00:00Z" })).toThrow(/must precede/);
  });
  it("sorts dates, preserves missing days, and calculates drawdown and per-observation volatility", () => {
    const input = priceFixture(); input.observations.reverse();
    const result = priceHistoryMetrics(input);
    expect(result.holdingPeriodReturn).toBeCloseTo(-0.1, 12);
    expect(result.maxDrawdown).toBe(-0.25);
    expect(result.currentDrawdown).toBe(-0.25);
    expect(result.perObservationVolatility).toBeCloseTo(Math.sqrt(0.10125), 12);
    expect(result.observations).toBe(3);
    expect(result.annualizedReturn).toBeNull();
    expect(result.returnKind).toBe("price_return");
    expect(result.warnings.some(w => w.includes("Dividends are excluded"))).toBe(true);
  });
  it("distinguishes dividend-adjusted returns and does not add dividends again", () => {
    const result = priceHistoryMetrics({ ...priceFixture(), adjustment: "split_and_dividend" });
    expect(result.returnKind).toBe("provider_adjusted_total_return");
    expect(result.warnings.join(" ")).toContain("Do not add cash dividends again");
    expect(() => priceHistoryMetrics({ ...priceFixture(), adjustment: "unadjusted" })).toThrow();
  });
  it("rejects duplicate dates, zero prices and post-cutoff observations", () => {
    const input = priceFixture(); input.observations.push(input.observations[0]);
    expect(() => priceHistoryMetrics(input)).toThrow();
    input.observations.pop(); input.observations[0].adjustedClose = 0;
    expect(() => priceHistoryMetrics(input)).toThrow();
    input.observations[0].adjustedClose = 100; input.observations[0].date = "2027-01-01";
    expect(() => priceHistoryMetrics(input)).toThrow();
  });
});
