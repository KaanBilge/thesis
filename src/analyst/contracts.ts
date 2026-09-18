import { z } from "zod";

export const ANALYST_VERSION = "1.0.0";
export const BASELINE_MODEL = "gpt-6-astra";
const text = z.string().trim().min(1).max(12000);
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.iso.datetime({ offset: true });
const ticker = z.string().regex(/^[A-Z][A-Z0-9.-]{0,10}$/);
const refs = z.array(id).max(100);
const artifactRefs = z.array(z.string().min(1).max(500)).min(1).max(30);
const url = z.url().refine(value => {
  const parsed = new URL(value);
  return parsed.protocol === "https:" && !parsed.username && !parsed.password &&
    ![...parsed.searchParams.keys()].some(key => /api.?key|token|secret|password/i.test(key));
}, "Use a public HTTPS source URL without credentials.");

export const WorkerSchema = z.strictObject({
  model: text,
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh", "max", "ultra"]),
  contextId: text,
  historyMode: z.enum(["fresh", "inherited"]),
});
export const RunSchema = z.strictObject({
  version: z.literal(1),
  ticker,
  asOf: timestamp,
  horizonMonths: z.number().int().min(6).max(18),
  modelPolicy: z.literal("astra-quality-baseline"),
});
export const SourceSchema = z.strictObject({
  id, url, title: text, publisher: text,
  kind: z.enum(["filing", "issuer", "macro", "market", "news", "industry"]),
  publishedAt: timestamp.nullable(), retrievedAt: timestamp,
  rawFile: z.string().min(1).max(500).nullable(), rawSha256: hash.nullable(),
});
export const ClaimSchema = z.strictObject({
  id, kind: z.enum(["fact", "interpretation", "uncertainty"]), text,
  status: z.enum(["supported", "missing", "conflicting"]), sourceIds: refs,
  observedAt: text,
  financialValue: z.strictObject({
    value: z.number().finite(), unit: text, currency: z.string().length(3).nullable(),
    periodStart: z.iso.date().nullable(), periodEnd: z.iso.date(),
  }).nullable(),
});
export const COVERAGE_AREAS = ["financials", "earnings", "macro", "news", "prices", "peers"] as const;
export const EvidenceSchema = z.strictObject({
  version: z.literal(1), ticker, companyName: text, asOf: timestamp,
  listing: z.strictObject({ exchange: text, currency: z.string().regex(/^[A-Z]{3}$/),
    securityType: z.literal("operating-company"), sourceIds: refs.min(1) }),
  sources: z.array(SourceSchema).min(1).max(150),
  claims: z.array(ClaimSchema).min(1).max(300),
  coverage: z.array(z.strictObject({
    area: z.enum(COVERAGE_AREAS), status: z.enum(["complete", "partial", "missing"]),
    claimIds: refs, limitations: z.array(text).max(20),
  })).length(COVERAGE_AREAS.length),
});
export const FrameworkSchema = z.strictObject({
  version: z.literal(1), ticker, horizonMonths: z.number().int().min(6).max(18), worker: WorkerSchema,
  basis: z.strictObject({ evidenceHash: hash }),
  methodology: text, methodRationale: text,
  drivers: z.array(z.strictObject({ id, name: text, definition: text, claimIds: refs })).min(1).max(12),
  materialQuestions: z.array(text).min(1).max(15), quoteClaimId: id.nullable(),
});
export const CaseSchema = z.strictObject({
  version: z.literal(1), side: z.enum(["bull", "bear"]), worker: WorkerSchema,
  basis: z.strictObject({ evidenceHash: hash, frameworkHash: hash }),
  arguments: z.array(z.strictObject({
    id, title: text, claimIds: refs.min(1), driverIds: refs.min(1), reasoning: text,
    counterEvidenceClaimIds: refs, counterArgument: text, impact: text,
  })).min(1).max(8),
  assumptions: z.array(z.strictObject({ driverId: id, value: text, rationale: text, claimIds: refs })).min(1).max(20),
  catalysts: z.array(z.strictObject({ description: text, window: text, claimIds: refs, condition: text })).max(12),
  invalidationConditions: z.array(z.strictObject({ condition: text, metric: text, threshold: text, claimIds: refs })).min(1).max(10),
  uncertainties: z.array(text).min(1).max(15),
});
const valuationBasis = {
  evidenceHash: hash, frameworkHash: hash, bullHash: hash, bearHash: hash,
  valuationInputHash: hash, valuationHash: hash,
};
const insight = z.strictObject({ text, claimIds: refs.min(1) });
export const SynthesisSchema = z.strictObject({
  version: z.literal(1), worker: WorkerSchema, basis: z.strictObject(valuationBasis),
  conclusion: z.enum(["attractive", "watch", "unattractive", "insufficient-evidence"]),
  summary: insight, strongestBullish: insight, strongestBearish: insight,
  baseCaseRationale: insight,
  disputes: z.array(z.strictObject({ driverId: id, resolution: text, claimIds: refs.min(1) })).min(1).max(12),
  catalysts: z.array(insight).max(12), risks: z.array(insight).min(1).max(15),
  entryRationale: insight, changeConditions: z.array(insight).min(1).max(12),
  limitations: z.array(text).min(1).max(20),
});
export const RUBRIC = [
  { id: "evidence", name: "Source accuracy and freshness", weight: 25 },
  { id: "financial", name: "Financial normalization and arithmetic", weight: 25 },
  { id: "valuation", name: "Valuation methods and assumptions", weight: 20 },
  { id: "adversarial", name: "Counterevidence and independent cases", weight: 15 },
  { id: "decision", name: "Horizon, catalysts and entry judgment", weight: 10 },
  { id: "clarity", name: "Clarity and materiality", weight: 5 },
] as const;
export const ReviewSchema = z.strictObject({
  version: z.literal(1), worker: WorkerSchema,
  basis: z.strictObject({ ...valuationBasis, synthesisHash: hash, financialNotesHash: hash, workflowHash: hash, auditNotesHash: hash }),
  dimensions: z.array(z.strictObject({
    id: z.enum(["evidence", "financial", "valuation", "adversarial", "decision", "clarity"]),
    score: z.number().int().min(0).max(4), rationale: text, artifactRefs,
  })).length(RUBRIC.length),
  findings: z.array(z.strictObject({
    id, stage: z.enum(["collection", "evidence", "framework", "bull", "bear", "calculation", "synthesis", "workflow"]),
    severity: z.enum(["critical", "major", "minor"]), description: text, artifactRefs,
    remediation: text, status: z.enum(["open", "resolved"]), resolutionEvidence: z.array(text).max(20),
  })).max(50),
});
export const UsageSchema = z.strictObject({
  version: z.literal(1), entries: z.array(z.strictObject({
    stage: text, model: text, contextId: text, measurement: z.enum(["reported", "estimated", "unavailable"]),
    inputTokens: z.number().int().nonnegative().nullable(), outputTokens: z.number().int().nonnegative().nullable(),
    reasoningTokens: z.number().int().nonnegative().nullable(), cachedInputTokens: z.number().int().nonnegative().nullable(),
    toolCalls: z.number().int().nonnegative(), retries: z.number().int().nonnegative(),
    elapsedMs: z.number().nonnegative().nullable(), notes: text,
  })).max(200),
});
export const IncompleteSchema = z.strictObject({
  version: z.literal(1), worker: WorkerSchema, runHash: hash,
  summary: text, reasons: z.array(text).min(1).max(20),
  nextSteps: z.array(text).min(1).max(20),
});
export type Run = z.infer<typeof RunSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Framework = z.infer<typeof FrameworkSchema>;
export type AnalystCase = z.infer<typeof CaseSchema>;
export type Synthesis = z.infer<typeof SynthesisSchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type Worker = z.infer<typeof WorkerSchema>;
export const artifactSchemas = {
  run: RunSchema, evidence: EvidenceSchema, framework: FrameworkSchema,
  case: CaseSchema, synthesis: SynthesisSchema, review: ReviewSchema, usage: UsageSchema, incomplete: IncompleteSchema,
};
