import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { artifactHash, byteHash, FILES, writeJson, type Artifacts } from "../src/analyst/artifacts";
import { COVERAGE_AREAS, RUBRIC, type AnalystCase, type Worker } from "../src/analyst/contracts";
import { calculateValuation, type Driver, type ValuationInput } from "../src/analyst/calculations";

// Fictional fixture for executable checks. These worker IDs and rubric scores are
// test inputs, not evidence of a real model run or financial research.
export const worker = (contextId: string): Worker => ({ model: "gpt-6-astra", reasoningEffort: "high", contextId, historyMode: "fresh" });
const assumption = (value: number): Driver => ({ value, kind: "assumption", rationale: "Fictional test assumption, not investment research.", sourceIds: [] });
export function analystFixture(): Artifacts {
  const note = "Fictional test note. No real source checks, model dispatches or independent financial audit occurred.\n";
  const notes = { financial: note, workflow: note, audit: note };
  const asOf = "2026-01-31T20:00:00Z", observedAt = "2026-01-30T21:00:00Z";
  const run: Artifacts["run"] = { version: 1, ticker: "TEST", asOf, horizonMonths: 12, modelPolicy: "astra-quality-baseline" };
  const evidence: Artifacts["evidence"] = {
    version: 1, ticker: "TEST", companyName: "Fictional analyst test company", asOf,
    listing: { exchange: "Fictional listing", currency: "USD", securityType: "operating-company", sourceIds: ["S1"] },
    sources: [{ id: "S1", title: "Fictional source fixture", publisher: "Test fixture", kind: "market", url: "https://example.com/fixture", publishedAt: observedAt, retrievedAt: asOf, rawFile: null, rawSha256: null }],
    claims: [{ id: "C1", kind: "fact", text: "Fictional quoted share price is 10 USD.", status: "supported", sourceIds: ["S1"], observedAt, financialValue: { value: 10, unit: "USD/share", currency: "USD", periodStart: null, periodEnd: "2026-01-30" } },
      { id: "C2", kind: "interpretation", text: "Fictional scenario risks and growth assumptions require testing.", status: "supported", sourceIds: ["S1"], observedAt, financialValue: null }],
    coverage: COVERAGE_AREAS.map(area => ({ area, status: "partial", claimIds: ["C2"], limitations: ["Synthetic test only: does not establish actual research coverage."] })),
  };
  const framework: Artifacts["framework"] = { version: 1, ticker: "TEST", horizonMonths: 12, worker: worker("fixture-framework"), basis: { evidenceHash: artifactHash(evidence) }, methodology: "Use conditional P/E for the synthetic arithmetic demonstration.", methodRationale: "A test of executable contracts, not a claim that relative valuation alone establishes intrinsic value.", drivers: [{ id: "D1", name: "Earnings", definition: "Annual diluted earnings per share", claimIds: ["C2"] }], materialQuestions: ["How do earnings assumptions affect the target?"], quoteClaimId: "C1" };
  const side = (name: "bull" | "bear"): AnalystCase => ({ version: 1, side: name, worker: worker(`fixture-${name}`), basis: { evidenceHash: artifactHash(evidence), frameworkHash: artifactHash(framework) }, arguments: [{ id: `${name}1`, title: "Fictional conditional outcome", claimIds: ["C2"], driverIds: ["D1"], reasoning: "Test assumes different EPS paths.", counterEvidenceClaimIds: ["C2"], counterArgument: "Test data cannot establish probability.", impact: "Conditional target changes with EPS." }], assumptions: [{ driverId: "D1", value: name === "bull" ? "2" : "0.8", rationale: "Synthetic case difference.", claimIds: ["C2"] }], catalysts: [], invalidationConditions: [{ condition: "Earnings differ", metric: "EPS", threshold: "Outside the stated scenario", claimIds: ["C2"] }], uncertainties: ["All facts are fictional fixtures."] });
  const bull = side("bull"), bear = side("bear");
  const valuationInput: ValuationInput = {
    schemaVersion: 1, ticker: "TEST", asOf, horizonMonths: 12, businessType: "operating",
    units: { currency: "USD", priceCurrency: "USD", financialScale: "units", shareScale: "units" },
    sources: [{ id: "S1", title: "Fictional source fixture", url: evidence.sources[0].url, availableAt: observedAt }],
    marketPrice: { ...assumption(10), kind: "observed", sourceIds: ["S1"], observedAt },
    entryPolicy: { requiredAnnualReturn: assumption(0.1), marginOfSafety: assumption(0.2) },
    scenarios: (["bear", "base", "bull"] as const).map((name, i) => ({
      name, horizonDistributionTreatment: "ex_dividend", dividends: [],
      fairValue: { method: "pe", valuationDate: "2026-01-31", rationale: "Fictional relative value", sourceIds: [], earningsPerShare: assumption(0.8 + i * 0.6), multiple: assumption(10), earningsBasis: "forward_12_months", earningsPeriodEnd: "2027-01-31", shareTreatment: "fully_diluted_eps" },
      horizonValue: { method: "pe", valuationDate: "2027-01-31", rationale: "Fictional horizon price", sourceIds: [], earningsPerShare: assumption(0.8 + i * 0.6), multiple: assumption(11), earningsBasis: "forward_12_months", earningsPeriodEnd: "2028-01-31", shareTreatment: "fully_diluted_eps" },
    })),
  };
  const valuation = calculateValuation(valuationInput);
  const basis = { evidenceHash: artifactHash(evidence), frameworkHash: artifactHash(framework), bullHash: artifactHash(bull), bearHash: artifactHash(bear), valuationInputHash: artifactHash(valuationInput), valuationHash: artifactHash(valuation) };
  const insight = { text: "Synthetic testing only; this is not a stock recommendation.", claimIds: ["C2"] };
  const synthesis: Artifacts["synthesis"] = { version: 1, worker: worker("fixture-synthesis"), basis, conclusion: "watch", summary: insight, strongestBullish: insight, strongestBearish: insight, baseCaseRationale: insight, disputes: [{ driverId: "D1", resolution: "Synthetic midpoint chosen to exercise the pipeline.", claimIds: ["C2"] }], catalysts: [], risks: [insight], entryRationale: insight, changeConditions: [insight], limitations: ["Fictional fixture; audit scores are supplied test values, not an actual independent audit."] };
  const review: Artifacts["review"] = { version: 1, worker: worker("fixture-review"), basis: { ...basis, synthesisHash: artifactHash(synthesis), financialNotesHash: byteHash(Buffer.from(note)), workflowHash: byteHash(Buffer.from(note)), auditNotesHash: byteHash(Buffer.from(note)) }, dimensions: RUBRIC.map(item => ({ id: item.id, score: 4, rationale: "Synthetic score to exercise the publication gate, not a research-quality assessment.", artifactRefs: ["evidence.json#/claims/0"] })), findings: [] };
  return { run, evidence, framework, bull, bear, valuationInput, valuation, synthesis, review, notes };
}
export function writeFixture(directory: string, a = analystFixture()) {
  mkdirSync(directory, { recursive: true });
  for (const [name, file] of Object.entries(FILES)) if (a[name as keyof Artifacts]) writeJson(join(directory, file), a[name as keyof Artifacts]);
  for (const [key, name] of Object.entries({ workflow: "workflow-record.md", financial: "raw-financial-notes.md", audit: "audit-notes.md" })) writeFileSync(join(directory, name), a.notes[key as keyof Artifacts["notes"]]!, "utf8");
  return a;
}
