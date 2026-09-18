import { z } from "zod";

const observation = z.strictObject({
  id: z.string().min(1), concept: z.string().min(1), unit: z.string().min(1),
  periodStart: z.iso.date(), periodEnd: z.iso.date(), value: z.number().finite(),
  sourceIds: z.array(z.string().min(1)).min(1),
});
export const PeriodInputSchema = z.strictObject({
  operation: z.enum(["sum-contiguous", "subtract-ytd"]),
  observations: z.array(observation).min(2).max(8),
  reconciliation: z.string().trim().min(1).max(4000),
}).superRefine((input, ctx) => {
  if (input.operation === "subtract-ytd" && input.observations.length !== 2) ctx.addIssue({ code: "custom", message: "YTD subtraction requires exactly two observations." });
  if (new Set(input.observations.map(row => row.id)).size !== input.observations.length) ctx.addIssue({ code: "custom", message: "Observation IDs must be unique." });
  const first = input.observations[0];
  input.observations.forEach((row, i) => {
    if (row.concept !== first.concept || row.unit !== first.unit) ctx.addIssue({ code: "custom", path: ["observations", i], message: "Normalize concept, accounting scope, units, currency and scale before arithmetic." });
    if (row.periodStart > row.periodEnd) ctx.addIssue({ code: "custom", path: ["observations", i], message: "Financial period starts after it ends." });
  });
});
const nextDay = (day: string) => new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10);

/** Financial-statement arithmetic only; semantic comparability is an analyst check. */
export function deriveFinancialPeriod(input: unknown) {
  const parsed = PeriodInputSchema.parse(input), rows = [...parsed.observations].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  let value: number, periodStart: string, periodEnd: string, formula: string;
  if (parsed.operation === "sum-contiguous") {
    for (let i = 1; i < rows.length; i++) if (rows[i].periodStart !== nextDay(rows[i - 1].periodEnd)) throw new Error("Periods overlap or have a gap. Use non-overlapping contiguous periods for a trailing sum.");
    value = rows.reduce((sum, row) => sum + row.value, 0); periodStart = rows[0].periodStart; periodEnd = rows.at(-1)!.periodEnd;
    formula = rows.map(row => row.id).join(" + ");
  } else {
    const [earlier, later] = rows;
    if (earlier.periodStart !== later.periodStart || earlier.periodEnd >= later.periodEnd) throw new Error("YTD subtraction requires a common fiscal start and different increasing period ends.");
    value = later.value - earlier.value; periodStart = nextDay(earlier.periodEnd); periodEnd = later.periodEnd; formula = `${later.id} - ${earlier.id}`;
  }
  if (!Number.isFinite(value)) throw new Error("Derived period value exceeds numeric range.");
  const days = (Date.parse(periodEnd) - Date.parse(periodStart)) / 86400000 + 1;
  return {
    operation: parsed.operation, concept: rows[0].concept, unit: rows[0].unit, value, periodStart, periodEnd, days,
    periodDescription: days >= 350 && days <= 380 ? "approximately_annual" : days >= 75 && days <= 105 ? "approximately_quarterly" : "explicit_duration",
    formula, sourceIds: [...new Set(rows.flatMap(row => row.sourceIds))], reconciliation: parsed.reconciliation,
    warning: "Dates establish arithmetic compatibility only. Verify reporting scope, currency, scale and restatement basis in original filings. Do not sum ratios, EPS, weighted-average shares or balance-sheet instants.",
  };
}
