import { z } from "zod";

/** All rates are decimals; money and shares use the declared common scale. */
export const DriverSchema = z.object({
  value: z.number().finite(),
  kind: z.enum(["observed", "assumption"]),
  rationale: z.string().trim().min(1).max(4000),
  sourceIds: z.array(z.string().min(1)).max(30),
}).strict().superRefine((driver, ctx) => {
  if (driver.kind === "observed" && driver.sourceIds.length === 0)
    ctx.addIssue({ code: "custom", path: ["sourceIds"], message: "Observed values require evidence sources." });
  if (new Set(driver.sourceIds).size !== driver.sourceIds.length)
    ctx.addIssue({ code: "custom", path: ["sourceIds"], message: "Source IDs must be unique." });
});

const driverBetween = (min: number, max = Infinity, exclusiveMin = false) => DriverSchema.refine(
  d => (exclusiveMin ? d.value > min : d.value >= min) && d.value <= max,
  `Value must be ${exclusiveMin ? ">" : ">="} ${min} and <= ${max}.`,
);
const positive = driverBetween(0, Infinity, true);
const nonnegative = driverBetween(0);
const rate = driverBetween(0, 1, true);
const fraction = driverBetween(0, 1);
const terminalGrowth = driverBetween(0, 0.1);
const date = z.iso.date();
const timestamp = z.iso.datetime({ offset: true });
const scale = z.enum(["units", "thousands", "millions", "billions"]);
const unitSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  priceCurrency: z.string().regex(/^[A-Z]{3}$/),
  financialScale: scale,
  shareScale: scale,
}).strict().superRefine((units, ctx) => {
  if (units.currency !== units.priceCurrency)
    ctx.addIssue({ code: "custom", message: "Convert monetary inputs and quote to the same currency before valuation." });
  if (units.financialScale !== units.shareScale)
    ctx.addIssue({ code: "custom", message: "Money and diluted shares must use the same scale to produce currency per share." });
});
const sourceSchema = z.object({
  id: z.string().min(1), title: z.string().min(1),
  url: z.url().refine(s => /^https?:\/\//.test(s), "Source URLs must use HTTP or HTTPS."),
  availableAt: timestamp,
}).strict();

/** No net-debt input: explicit components prevent adding cash twice. */
export const EquityBridgeSchema = z.object({
  cashAndEquivalents: nonnegative,
  debt: nonnegative,
  preferredEquity: nonnegative,
  nonControllingInterests: nonnegative,
  otherNonOperatingAssets: nonnegative,
  otherClaims: nonnegative,
  cashTreatment: z.literal("excess_non_operating_only"),
  shareTreatment: z.literal("fully_diluted_no_separate_option_deduction"),
}).strict();

const modelCommon = {
  valuationDate: date,
  rationale: z.string().trim().min(1).max(4000),
  sourceIds: z.array(z.string().min(1)).max(30),
};
const fcffYear = z.object({
  year: z.number().int().min(1).max(20),
  revenue: positive,
  operatingMargin: driverBetween(-1, 1),
  cashTaxes: nonnegative,
  depreciation: nonnegative,
  capitalExpenditure: nonnegative,
  changeWorkingCapital: DriverSchema,
}).strict();
const fcfeYear = z.object({
  year: z.number().int().min(1).max(20),
  netIncomeToCommon: DriverSchema,
  equityReinvestment: DriverSchema,
}).strict();
const dcfModelSchema = z.object({
  ...modelCommon,
  method: z.literal("dcf_fcff"),
  forecast: z.array(fcffYear).min(1).max(20),
  discountRate: rate,
  terminal: z.object({
    growth: terminalGrowth,
    operatingMargin: driverBetween(0, 1, true),
    taxRate: fraction,
    returnOnCapital: positive,
  }).strict(),
  bridge: EquityBridgeSchema,
  dilutedShares: positive,
  sensitivity: z.object({ discountRates: z.array(rate).min(2).max(10), terminalGrowths: z.array(terminalGrowth).min(2).max(8) }).strict(),
}).strict();
const fcfeModelSchema = z.object({
  ...modelCommon,
  method: z.literal("fcfe"),
  forecast: z.array(fcfeYear).min(1).max(20),
  costOfEquity: rate,
  terminal: z.object({ growth: terminalGrowth, returnOnEquity: positive }).strict(),
  dilutedShares: positive,
  commonEquityCashFlows: z.literal("after_interest_and_preferred_distributions"),
  sensitivity: z.object({ discountRates: z.array(rate).min(2).max(10), terminalGrowths: z.array(terminalGrowth).min(2).max(8) }).strict(),
}).strict();
const periodBasis = z.enum(["forward_12_months", "trailing_12_months", "normalized_annual"]);
const peModelSchema = z.object({
  ...modelCommon,
  method: z.literal("pe"),
  earningsPerShare: positive,
  multiple: positive,
  earningsBasis: periodBasis,
  earningsPeriodEnd: date,
  shareTreatment: z.literal("fully_diluted_eps"),
}).strict();
const evModelSchema = z.object({
  ...modelCommon,
  method: z.literal("ev_multiple"),
  metric: z.enum(["ebitda", "ebit", "revenue"]),
  metricValue: positive,
  multiple: positive,
  metricBasis: periodBasis,
  metricPeriodEnd: date,
  leaseTreatment: z.literal("debt_and_metric_consistent"),
  bridge: EquityBridgeSchema,
  dilutedShares: positive,
}).strict();

export const ValuationModelSchema = z.discriminatedUnion("method", [
  dcfModelSchema, fcfeModelSchema, peModelSchema, evModelSchema,
]).superRefine((model, ctx) => {
  if (model.method === "pe" || model.method === "ev_multiple") {
    const basis = model.method === "pe" ? model.earningsBasis : model.metricBasis;
    const end = model.method === "pe" ? model.earningsPeriodEnd : model.metricPeriodEnd;
    if ((basis === "trailing_12_months" && end > model.valuationDate) || (basis === "forward_12_months" && end <= model.valuationDate))
      ctx.addIssue({ code: "custom", message: "Trailing/forward earnings or metric period must be consistent with the model valuation date." });
  }
  if (model.method !== "dcf_fcff" && model.method !== "fcfe") return;
  model.forecast.forEach((row, index) => {
    if (row.year !== index + 1) ctx.addIssue({ code: "custom", path: ["forecast", index, "year"], message: "Forecast rows must be consecutive annual periods starting at year 1; stub periods are unsupported." });
  });
  const discount = model.method === "dcf_fcff" ? model.discountRate.value : model.costOfEquity.value;
  const growth = model.terminal.growth.value;
  const returnOnCapital = model.method === "dcf_fcff" ? model.terminal.returnOnCapital.value : model.terminal.returnOnEquity.value;
  if (discount <= growth) ctx.addIssue({ code: "custom", message: "Discount rate must exceed terminal growth." });
  if (returnOnCapital <= growth) ctx.addIssue({ code: "custom", path: ["terminal"], message: "Terminal return on capital/equity must exceed growth to support positive distributable cash flow." });
  if (model.method === "dcf_fcff" && model.terminal.taxRate.value === 1)
    ctx.addIssue({ code: "custom", path: ["terminal", "taxRate"], message: "A going-concern terminal model needs positive after-tax operating income." });
  if (model.method === "fcfe" && model.forecast.at(-1)!.netIncomeToCommon.value <= 0)
    ctx.addIssue({ code: "custom", path: ["forecast"], message: "FCFE terminal model requires positive normalized final-year income to common equity." });
  const sensitivities = model.sensitivity.discountRates.map(x => x.value);
  if (new Set(sensitivities).size !== sensitivities.length)
    ctx.addIssue({ code: "custom", path: ["sensitivity"], message: "Sensitivity rates must be unique." });
  if (!sensitivities.some(r => r < discount) || !sensitivities.some(r => r > discount))
    ctx.addIssue({ code: "custom", path: ["sensitivity"], message: "Sensitivity rates must include values below and above the selected discount rate." });
  model.sensitivity.discountRates.forEach((r, index) => {
    if (r.value <= growth) ctx.addIssue({ code: "custom", path: ["sensitivity", "discountRates", index], message: "Every sensitivity discount rate must exceed terminal growth." });
  });
  const growths = model.sensitivity.terminalGrowths.map(d => d.value);
  if (new Set(growths).size !== growths.length || Math.min(...growths) > growth || Math.max(...growths) < growth)
    ctx.addIssue({ code: "custom", path: ["sensitivity", "terminalGrowths"], message: "Use distinct terminal-growth assumptions spanning the selected growth rate." });
  growths.forEach((g, index) => {
    if (g >= returnOnCapital || g >= Math.min(discount, ...sensitivities)) ctx.addIssue({ code: "custom", path: ["sensitivity", "terminalGrowths", index], message: "Every growth/rate grid point requires growth below discount rate and return on capital/equity." });
  });
});

const dividendSchema = z.object({
  monthsFromAsOf: z.number().finite().positive().max(18),
  perShare: nonnegative,
}).strict();
const scenarioSchema = z.object({
  name: z.enum(["bear", "base", "bull"]),
  fairValue: ValuationModelSchema,
  horizonValue: ValuationModelSchema,
  dividends: z.array(dividendSchema).max(36),
  horizonDistributionTreatment: z.literal("ex_dividend"),
}).strict();

/** Add calendar months, clamping month-end rather than overflowing into another month. */
export function addCalendarMonths(isoDate: string, months: number): string {
  date.parse(isoDate);
  z.number().int().min(0).max(240).parse(months);
  const [year, month, day] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function visitObjects(value: unknown, fn: (v: Record<string, unknown>, path: (string | number)[]) => void, path: (string | number)[] = []) {
  if (Array.isArray(value)) value.forEach((v, i) => visitObjects(v, fn, [...path, i]));
  else if (value !== null && typeof value === "object") {
    fn(value as Record<string, unknown>, path);
    Object.entries(value).forEach(([key, child]) => visitObjects(child, fn, [...path, key]));
  }
}

export const ValuationInputSchema = z.object({
  schemaVersion: z.literal(1),
  ticker: z.string().regex(/^[A-Z][A-Z0-9.-]{0,14}$/),
  asOf: timestamp,
  horizonMonths: z.number().int().min(6).max(18).default(12),
  businessType: z.enum(["operating", "bank", "insurance"]),
  units: unitSchema,
  sources: z.array(sourceSchema).max(500),
  marketPrice: DriverSchema.safeExtend({ observedAt: timestamp }).refine(d => d.value > 0, "Market price must be positive.").refine(d => d.kind === "observed", "Market price must be an observed quote, not an analyst assumption."),
  entryPolicy: z.object({
    requiredAnnualReturn: driverBetween(0, 1),
    marginOfSafety: driverBetween(0, 0.99),
  }).strict(),
  scenarios: z.array(scenarioSchema).length(3),
}).strict().superRefine((input, ctx) => {
  const ids = new Set(input.sources.map(s => s.id));
  if (ids.size !== input.sources.length) ctx.addIssue({ code: "custom", path: ["sources"], message: "Source IDs must be unique." });
  const cutoff = Date.parse(input.asOf);
  if (Date.parse(input.marketPrice.observedAt) > cutoff) ctx.addIssue({ code: "custom", path: ["marketPrice", "observedAt"], message: "Quote cannot be observed after the research cutoff." });
  input.sources.forEach((source, i) => {
    if (Date.parse(source.availableAt) > cutoff) ctx.addIssue({ code: "custom", path: ["sources", i], message: "Source was unavailable at the research cutoff; look-ahead is prohibited." });
  });
  if (new Set(input.scenarios.map(s => s.name)).size !== 3) ctx.addIssue({ code: "custom", path: ["scenarios"], message: "Exactly one bear, base and bull scenario is required." });
  const presentDate = new Date(cutoff).toISOString().slice(0, 10);
  const horizonDate = addCalendarMonths(presentDate, input.horizonMonths);
  input.scenarios.forEach((scenario, index) => {
    for (const [basis, expectedDate] of [["fairValue", presentDate], ["horizonValue", horizonDate]] as const) {
      const model = scenario[basis];
      if (model.valuationDate !== expectedDate) ctx.addIssue({ code: "custom", path: ["scenarios", index, basis, "valuationDate"], message: `Model must be valued at ${expectedDate}.` });
      if (input.businessType !== "operating" && (model.method === "dcf_fcff" || model.method === "ev_multiple"))
        ctx.addIssue({ code: "custom", path: ["scenarios", index, basis, "method"], message: "Banks and insurers require equity-focused methods; FCFF and enterprise multiples are unsupported." });
    }
    scenario.dividends.forEach((payment, i) => {
      if (payment.monthsFromAsOf > input.horizonMonths) ctx.addIssue({ code: "custom", path: ["scenarios", index, "dividends", i], message: "Dividend payment falls after the investment horizon." });
    });
  });
  visitObjects(input, (obj, path) => {
    if (Array.isArray(obj.sourceIds)) obj.sourceIds.forEach((id, i) => {
      if (!ids.has(String(id))) ctx.addIssue({ code: "custom", path: [...path, "sourceIds", i], message: `Unknown evidence source ID: ${id}.` });
    });
  });
});

export type Driver = z.infer<typeof DriverSchema>;
export type ValuationModel = z.infer<typeof ValuationModelSchema>;
export type ValuationInput = z.infer<typeof ValuationInputSchema>;
type EquityBridge = z.infer<typeof EquityBridgeSchema>;
type CashFlowRow = { year: number; cashFlow: number; presentValue: number; operatingIncome?: number; cashTaxes?: number; reinvestment?: number };
export type ModelResult = {
  method: ValuationModel["method"];
  valuationDate: string;
  status: "valued" | "nonpositive_common_equity";
  rawEquityValue: number | null;
  enterpriseValue: number | null;
  perShareValue: number | null;
  netDebt?: number;
  cashFlows?: CashFlowRow[];
  terminal?: { cashFlow: number; valueAtForecastEnd: number; presentValue: number; shareOfDiscountedValue: number | null; reinvestmentRate: number };
  sensitivity?: { discountRate: number; rawEquityValue: number; perShareValue: number | null }[];
  terminalGrowthSensitivity?: { discountRate: number; terminalGrowth: number; rawEquityValue: number; perShareValue: number | null }[];
  warnings: string[];
};

function bridgeEquity(enterpriseValue: number, bridge: EquityBridge): number {
  return enterpriseValue + bridge.cashAndEquivalents.value + bridge.otherNonOperatingAssets.value
    - bridge.debt.value - bridge.preferredEquity.value - bridge.nonControllingInterests.value - bridge.otherClaims.value;
}
function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} exceeds the supported numeric range.`);
  return value;
}
function perShare(rawEquityValue: number, dilutedShares: number): number | null {
  requireFinite(rawEquityValue, "Equity value");
  return rawEquityValue > 0 ? requireFinite(rawEquityValue / dilutedShares, "Per-share value") : null;
}

/** Monetary rows are discounted at end-of-year; terminal value is measured at year N. */
function discountedModel(model: Extract<ValuationModel, { method: "dcf_fcff" | "fcfe" }>, discountRate: number, growthOverride?: number) {
  const cashFlows: CashFlowRow[] = model.forecast.map(row => {
    if ("revenue" in row) {
      const operatingIncome = row.revenue.value * row.operatingMargin.value;
      const reinvestment = row.capitalExpenditure.value - row.depreciation.value + row.changeWorkingCapital.value;
      const cashFlow = operatingIncome - row.cashTaxes.value - reinvestment;
      return { year: row.year, operatingIncome, cashTaxes: row.cashTaxes.value, reinvestment, cashFlow, presentValue: cashFlow / (1 + discountRate) ** row.year };
    }
    const cashFlow = row.netIncomeToCommon.value - row.equityReinvestment.value;
    return { year: row.year, reinvestment: row.equityReinvestment.value, cashFlow, presentValue: cashFlow / (1 + discountRate) ** row.year };
  });
  const growth = growthOverride ?? model.terminal.growth.value;
  const reinvestmentRate = growth / (model.method === "dcf_fcff" ? model.terminal.returnOnCapital.value : model.terminal.returnOnEquity.value);
  const terminalIncome = model.method === "dcf_fcff"
    ? model.forecast.at(-1)!.revenue.value * (1 + growth) * model.terminal.operatingMargin.value * (1 - model.terminal.taxRate.value)
    : model.forecast.at(-1)!.netIncomeToCommon.value * (1 + growth);
  const terminalCashFlow = terminalIncome * (1 - reinvestmentRate);
  const terminalValue = terminalCashFlow / (discountRate - growth);
  const terminalPV = terminalValue / (1 + discountRate) ** cashFlows.length;
  const discountedValue = cashFlows.reduce((total, row) => total + row.presentValue, terminalPV);
  requireFinite(discountedValue, "Discounted value");
  return {
    cashFlows,
    terminal: { cashFlow: terminalCashFlow, valueAtForecastEnd: terminalValue, presentValue: terminalPV, shareOfDiscountedValue: discountedValue > 0 ? terminalPV / discountedValue : null, reinvestmentRate },
    discountedValue,
    rawEquityValue: model.method === "dcf_fcff" ? bridgeEquity(discountedValue, model.bridge) : discountedValue,
  };
}

export function calculateModel(input: unknown): ModelResult {
  const model = ValuationModelSchema.parse(input);
  const warnings: string[] = [];
  if (model.method === "pe") {
    const value = requireFinite(model.earningsPerShare.value * model.multiple.value, "P/E value");
    return { method: model.method, valuationDate: model.valuationDate, status: "valued", rawEquityValue: null, enterpriseValue: null, perShareValue: value, warnings: ["P/E is a relative equity value; the multiple must match the stated earnings period, accounting basis and business risk. No cash/debt bridge is added to EPS value."] };
  }
  if (model.method === "ev_multiple") {
    const enterpriseValue = requireFinite(model.metricValue.value * model.multiple.value, "Enterprise value");
    const rawEquityValue = bridgeEquity(enterpriseValue, model.bridge);
    const value = perShare(rawEquityValue, model.dilutedShares.value);
    if (value === null) warnings.push("The enterprise-to-common-equity bridge is nonpositive. A distressed/recovery or option model is needed; this is not a negative stock-price forecast.");
    warnings.push(`EV/${model.metric.toUpperCase()} requires comparable accounting, lease treatment, growth, margins and capital intensity; multiples do not establish intrinsic value by themselves.`);
    return { method: model.method, valuationDate: model.valuationDate, status: value === null ? "nonpositive_common_equity" : "valued", rawEquityValue, enterpriseValue, perShareValue: value, netDebt: model.bridge.debt.value - model.bridge.cashAndEquivalents.value, warnings };
  }
  const discountRate = model.method === "dcf_fcff" ? model.discountRate.value : model.costOfEquity.value;
  const result = discountedModel(model, discountRate);
  const value = perShare(result.rawEquityValue, model.dilutedShares.value);
  if (value === null) warnings.push("Discounted common equity is nonpositive. Use a financing/distress/recovery analysis; no tradable price or entry ceiling is inferred.");
  if (result.terminal.shareOfDiscountedValue !== null && result.terminal.shareOfDiscountedValue > 0.75)
    warnings.push("More than 75% of discounted value comes from the terminal period; the estimate is highly dependent on terminal assumptions.");
  if (result.cashFlows.some(row => row.cashFlow < 0))
    warnings.push("Explicit forecasts include negative cash flow. Financing availability, dilution and survival must be evaluated separately.");
  if (model.terminal.growth.value > 0.04)
    warnings.push("Terminal nominal growth exceeds 4%; justify currency inflation, long-run economic growth and market share explicitly.");
  warnings.push("End-of-year annual cash flows, constant nominal discount rate and a perpetual going concern are assumed. Terminal reinvestment equals growth divided by return on capital/equity.");
  if (model.method === "fcfe") warnings.push("FCFE is already attributable to common equity: no additional cash, debt or preferred-equity bridge is applied. For financial firms, equity reinvestment must reflect required regulatory capital and feasible distributions.");
  const sensitivity = model.sensitivity.discountRates.map(rate => {
    const point = discountedModel(model, rate.value);
    return { discountRate: rate.value, rawEquityValue: point.rawEquityValue, perShareValue: perShare(point.rawEquityValue, model.dilutedShares.value) };
  });
  const terminalGrowthSensitivity = model.sensitivity.discountRates.flatMap(rate => model.sensitivity.terminalGrowths.map(growth => {
    const point = discountedModel(model, rate.value, growth.value);
    return { discountRate: rate.value, terminalGrowth: growth.value, rawEquityValue: point.rawEquityValue, perShareValue: perShare(point.rawEquityValue, model.dilutedShares.value) };
  }));
  return {
    method: model.method, valuationDate: model.valuationDate, status: value === null ? "nonpositive_common_equity" : "valued",
    rawEquityValue: result.rawEquityValue, enterpriseValue: model.method === "dcf_fcff" ? result.discountedValue : null,
    perShareValue: value, ...(model.method === "dcf_fcff" ? { netDebt: model.bridge.debt.value - model.bridge.cashAndEquivalents.value } : {}),
    cashFlows: result.cashFlows, terminal: result.terminal, sensitivity, terminalGrowthSensitivity, warnings,
  };
}

export const ReversePeInputSchema = z.object({
  marketPrice: positive,
  multiple: positive,
  horizonMonths: z.number().int().min(6).max(18).default(12),
  requiredAnnualReturn: driverBetween(0, 1),
  dividends: z.array(dividendSchema).max(36),
  currentEarningsPerShare: positive.optional(),
}).strict().superRefine((input, ctx) => {
  input.dividends.forEach((payment, i) => {
    if (payment.monthsFromAsOf > input.horizonMonths) ctx.addIssue({ code: "custom", path: ["dividends", i], message: "Dividend payment falls after the investment horizon." });
  });
});

/** Reverse P/E is an expectation at a fixed multiple, not an earnings forecast. */
export function reversePe(input: unknown) {
  const parsed = ReversePeInputSchema.parse(input);
  const years = parsed.horizonMonths / 12;
  const growthFactor = (1 + parsed.requiredAnnualReturn.value) ** years;
  const dividendsPV = parsed.dividends.reduce((sum, payment) => sum + payment.perShare.value / (1 + parsed.requiredAnnualReturn.value) ** (payment.monthsFromAsOf / 12), 0);
  const requiredExDividendPrice = requireFinite((parsed.marketPrice.value - dividendsPV) * growthFactor, "Reverse price");
  const requiredHorizonEarningsPerShare = requireFinite(requiredExDividendPrice / parsed.multiple.value, "Reverse EPS");
  const currentImpliedEarningsPerShare = requireFinite(parsed.marketPrice.value / parsed.multiple.value, "Current implied EPS");
  return {
    method: "reverse_pe" as const,
    currentImpliedEarningsPerShare,
    requiredExDividendPrice,
    requiredHorizonEarningsPerShare: requiredHorizonEarningsPerShare > 0 ? requiredHorizonEarningsPerShare : null,
    requiredEarningsGrowth: parsed.currentEarningsPerShare && requiredHorizonEarningsPerShare > 0 ? requiredHorizonEarningsPerShare / parsed.currentEarningsPerShare.value - 1 : null,
    warnings: ["These are implied earnings conditional on the selected multiple and return hurdle, not market consensus or a forecast.", ...(requiredHorizonEarningsPerShare <= 0 ? ["Assumed dividends already meet the hurdle; positive-earnings reverse P/E is not informative."] : [])],
  };
}

export function calculateValuation(input: unknown) {
  const parsed = ValuationInputSchema.parse(input);
  const years = parsed.horizonMonths / 12;
  const warnings: string[] = [];
  const quoteAgeDays = (Date.parse(parsed.asOf) - Date.parse(parsed.marketPrice.observedAt)) / 86_400_000;
  if (quoteAgeDays > 4) warnings.push("Quote is more than four calendar days old. Refresh or explicitly qualify current-price conclusions; market holidays may affect freshness.");
  const assumptions: { path: string; value: number; kind: string; rationale: string; sourceIds: string[] }[] = [];
  visitObjects(parsed, (obj, path) => {
    if (typeof obj.value === "number" && (obj.kind === "observed" || obj.kind === "assumption"))
      assumptions.push({ path: path.join("."), value: obj.value, kind: obj.kind, rationale: String(obj.rationale), sourceIds: obj.sourceIds as string[] });
  });
  const scenarios = parsed.scenarios.map(scenario => {
    const fairValue = calculateModel(scenario.fairValue);
    const horizonValue = calculateModel(scenario.horizonValue);
    const dividends = scenario.dividends.reduce((sum, payment) => sum + payment.perShare.value, 0);
    const dividendsPV = scenario.dividends.reduce((sum, payment) => sum + payment.perShare.value / (1 + parsed.entryPolicy.requiredAnnualReturn.value) ** (payment.monthsFromAsOf / 12), 0);
    const price = horizonValue.perShareValue;
    const currentFair = fairValue.perShareValue;
    const terminalWealth = price === null ? null : price + dividends;
    const returnRequiredCeiling = price === null ? null : price / (1 + parsed.entryPolicy.requiredAnnualReturn.value) ** years + dividendsPV;
    const marginOfSafetyCeiling = currentFair === null ? null : currentFair * (1 - parsed.entryPolicy.marginOfSafety.value);
    return {
      name: scenario.name, fairValue, horizonValue,
      dividendsPerShare: dividends,
      returns: {
        priceReturn: price === null ? null : price / parsed.marketPrice.value - 1,
        totalReturn: terminalWealth === null ? null : terminalWealth / parsed.marketPrice.value - 1,
        annualizedTotalReturn: terminalWealth === null ? null : (terminalWealth / parsed.marketPrice.value) ** (1 / years) - 1,
        convention: "terminal_wealth_cash_dividends_not_reinvested" as const,
      },
      entry: {
        returnRequiredCeiling, marginOfSafetyCeiling,
        entryCeiling: returnRequiredCeiling === null || marginOfSafetyCeiling === null ? null : Math.min(returnRequiredCeiling, marginOfSafetyCeiling),
        formula: "min(P_horizon/(1+r)^(months/12) + sum(D_t/(1+r)^(t/12)), fair_value_today*(1-margin_of_safety))",
      },
      reverseValuation: scenario.horizonValue.method === "pe" ? reversePe({
        marketPrice: { value: parsed.marketPrice.value, kind: parsed.marketPrice.kind, rationale: parsed.marketPrice.rationale, sourceIds: parsed.marketPrice.sourceIds },
        multiple: scenario.horizonValue.multiple, horizonMonths: parsed.horizonMonths,
        requiredAnnualReturn: parsed.entryPolicy.requiredAnnualReturn, dividends: scenario.dividends,
        ...(scenario.fairValue.method === "pe" ? { currentEarningsPerShare: scenario.fairValue.earningsPerShare } : {}),
      }) : null,
      warnings: ["Horizon value must exclude dividends paid during the holding period. Horizon cash, debt, shares and earnings must reflect financing, buybacks, dilution and distributions once.", "Entry ceilings are conditional on scenario assumptions and an explicit return policy; they are not a price-trend forecast or a personalized position size."],
    };
  });
  for (const field of ["fairValue", "horizonValue"] as const) {
    const bear = scenarios.find(s => s.name === "bear")![field].perShareValue;
    const base = scenarios.find(s => s.name === "base")![field].perShareValue;
    const bull = scenarios.find(s => s.name === "bull")![field].perShareValue;
    if (bear !== null && base !== null && bull !== null && !(bear <= base && base <= bull))
      warnings.push(`${field}: scenario values are not ordered bear <= base <= bull; review economic consistency. Values were not rearranged or altered.`);
  }
  const result = {
    schemaVersion: 1 as const, ticker: parsed.ticker, asOf: parsed.asOf,
    horizonDate: addCalendarMonths(new Date(parsed.asOf).toISOString().slice(0, 10), parsed.horizonMonths),
    horizonMonths: parsed.horizonMonths, units: parsed.units, marketPrice: parsed.marketPrice.value, quoteAgeDays,
    scenarios, warnings,
    lineage: { sources: parsed.sources, assumptions },
  };
  // JSON silently converts non-finite numbers to null; reject overflow instead.
  visitObjects(result, obj => Object.values(obj).forEach(value => { if (typeof value === "number") requireFinite(value, "Valuation output"); }));
  return result;
}

export const PriceHistoryInputSchema = z.object({
  ticker: z.string().regex(/^[A-Z][A-Z0-9.-]{0,14}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  asOf: timestamp,
  adjustment: z.enum(["split_only", "split_and_dividend"]),
  source: sourceSchema,
  observations: z.array(z.object({ date, adjustedClose: z.number().finite().positive() }).strict()).min(2).max(20_000),
}).strict().superRefine((input, ctx) => {
  const dates = input.observations.map(row => row.date);
  if (new Set(dates).size !== dates.length) ctx.addIssue({ code: "custom", path: ["observations"], message: "Duplicate dates are ambiguous; resolve them before calculating returns." });
  // Date-only daily closes cannot establish availability within the cutoff day.
  const cutoff = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(input.asOf));
  input.observations.forEach((row, i) => {
    if (row.date >= cutoff) ctx.addIssue({ code: "custom", path: ["observations", i], message: "Date-only daily prices must precede the cutoff's New York calendar date." });
  });
  if (Date.parse(input.source.availableAt) > Date.parse(input.asOf)) ctx.addIssue({ code: "custom", path: ["source"], message: "Price source was unavailable at the research cutoff." });
});

/** Historical context only. No trend extrapolation or entry signal is generated. */
export function priceHistoryMetrics(input: unknown) {
  const parsed = PriceHistoryInputSchema.parse(input);
  const rows = [...parsed.observations].sort((a, b) => a.date.localeCompare(b.date));
  const first = rows[0], last = rows.at(-1)!;
  let peak = first.adjustedClose, maxDrawdown = 0, currentDrawdown = 0;
  const returns: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    peak = Math.max(peak, rows[i].adjustedClose);
    currentDrawdown = rows[i].adjustedClose / peak - 1;
    maxDrawdown = Math.min(maxDrawdown, currentDrawdown);
    if (i > 0) returns.push(rows[i].adjustedClose / rows[i - 1].adjustedClose - 1);
  }
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const perObservationVolatility = returns.length < 2 ? null : Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1));
  const days = (Date.parse(last.date) - Date.parse(first.date)) / 86_400_000;
  const staleDays = (Date.parse(new Date(parsed.asOf).toISOString().slice(0, 10)) - Date.parse(last.date)) / 86_400_000;
  const periodReturns = [1, 3, 6, 12].map(months => {
    const end = new Date(last.date);
    const target = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months, 1));
    const monthEnd = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(end.getUTCDate(), monthEnd));
    const targetDate = target.toISOString().slice(0, 10);
    const start = rows.findLast(row => row.date <= targetDate);
    const available = start && (Date.parse(targetDate) - Date.parse(start.date)) / 86400000 <= 7;
    return { months, requestedStart: targetDate, actualStart: available ? start.date : null, actualEnd: last.date,
      return: available ? last.adjustedClose / start.adjustedClose - 1 : null,
      limitation: available ? null : "No observation at or within seven prior calendar days of the requested start." };
  });
  const warnings = ["Metrics describe supplied observations only. Missing sessions are not filled. Volatility is per observation; annualization requires a verified sampling calendar."];
  if (staleDays > 4) warnings.push("Last observation is more than four calendar days before cutoff; the series may be stale.");
  if (parsed.adjustment === "split_only") warnings.push("Dividends are excluded: these are price returns, not total returns.");
  else warnings.push("Return interpretation depends on the provider's dividend-adjustment/reinvestment convention. Do not add cash dividends again.");
  const result = {
    ticker: parsed.ticker, currency: parsed.currency, asOf: parsed.asOf, adjustment: parsed.adjustment,
    returnKind: parsed.adjustment === "split_only" ? "price_return" : "provider_adjusted_total_return",
    firstDate: first.date, lastDate: last.date, observations: rows.length, calendarDays: days,
    holdingPeriodReturn: last.adjustedClose / first.adjustedClose - 1,
    annualizedReturn: days >= 365 ? (last.adjustedClose / first.adjustedClose) ** (365.25 / days) - 1 : null,
    maxDrawdown, currentDrawdown, perObservationVolatility,
    periodReturns,
    source: parsed.source, warnings,
  };
  visitObjects(result, obj => Object.values(obj).forEach(value => { if (typeof value === "number") requireFinite(value, "Price metric output"); }));
  return result;
}
