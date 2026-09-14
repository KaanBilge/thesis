import { z } from "zod";

export const TickerSchema = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{0,5}(?:[.-][A-Z0-9]{1,4})?$/, "Use a ticker such as AAPL, BRK.B, or VOD.L (up to 11 characters).");
const text = z.string().min(1).max(6000);
const id = z.string().min(1).max(80);
const score = z.number().int().min(0).max(100);
const refs = z.array(id).max(40);
export const SourceSchema = z.strictObject({
  id, title: text, url: z.string().regex(/^https?:\/\/[^\s]+$/).refine(value => {
    try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password; }
    catch { return false; }
  }, "Use an absolute HTTP(S) source URL without credentials."),
  publisher: text, publishedAt: z.string().nullable(), retrievedAt: z.iso.datetime(),
  type: z.enum(["filing", "investor_relations", "news", "industry", "other"]),
});
export const ClaimSchema = z.strictObject({
  id, text, kind: z.enum(["fact", "interpretation", "uncertainty"]),
  status: z.enum(["supported", "missing", "uncertain", "conflicting"]),
  sourceIds: refs, observedAt: z.string().nullable(),
});
export const RESEARCH_TOPICS = ["businessModel", "revenueDrivers", "growthIndicators", "profitability", "valuation", "competitivePosition", "catalysts", "risks", "marketSentiment", "uncertainties"] as const;
const claims = z.array(ClaimSchema).min(1).max(8);
export const ResearchPacketSchema = z.strictObject({
  ticker: z.string().min(1).max(11), companyName: text, sector: text, industry: text,
  companySourceIds: z.array(id).min(1),
  businessModel: claims, revenueDrivers: claims, growthIndicators: claims,
  profitability: claims, valuation: claims, competitivePosition: claims,
  catalysts: claims, risks: claims, marketSentiment: claims, uncertainties: claims,
  sources: z.array(SourceSchema).min(1).max(40), asOf: z.iso.datetime(),
});
export const MetricSchema = z.strictObject({
  id, name: text, description: text, weight: z.number().int().min(1).max(100),
  rationale: text, evidenceRequired: z.array(text).min(1).max(8), scoringGuidance: text,
});
export const MethodologySchema = z.strictObject({
  explanation: text, horizon: text, metrics: z.array(MetricSchema).min(5).max(8),
}).superRefine((value, ctx) => {
  if (value.metrics.reduce((sum, m) => sum + m.weight, 0) !== 100)
    ctx.addIssue({ code: "custom", path: ["metrics"], message: "Metric weights must total exactly 100." });
  if (new Set(value.metrics.map(m => m.id)).size !== value.metrics.length)
    ctx.addIssue({ code: "custom", path: ["metrics"], message: "Metric IDs must be unique." });
});
export const InsightSchema = z.strictObject({ text, claimIds: refs, sourceIds: refs });
export const ArgumentSchema = z.strictObject({
  title: text, explanation: text, evidence: z.array(InsightSchema).min(1).max(6),
  metricIds: z.array(id).min(1).max(8), counterEvidence: z.array(InsightSchema).min(1).max(5),
});
const caseShape = {
  summary: text, arguments: z.array(ArgumentSchema).min(3).max(7),
  catalysts: z.array(InsightSchema).min(1).max(6), conditions: z.array(InsightSchema).min(1).max(6),
  risksAndUncertainties: z.array(InsightSchema).min(1).max(6), confidence: score,
  metricAssessments: z.array(z.strictObject({ metricId: id, strengthScore: score })).min(5).max(8),
  sourceIds: refs,
};
export const BullCaseSchema = z.strictObject({ side: z.literal("bull"), ...caseShape });
export const BearCaseSchema = z.strictObject({ side: z.literal("bear"), ...caseShape });
export const MetricDecisionSchema = z.strictObject({
  metricId: id, weight: z.number().int().min(1).max(100), bullScore: score, bearScore: score,
  netMetricScore: z.number().min(0).max(100), evidence: z.array(InsightSchema).min(1).max(8),
  explanation: text, dataQualityConfidence: score,
});
export const OrchestratorSchema = z.strictObject({
  summary: text, strongestBullishFactor: InsightSchema, strongestBearishFactor: InsightSchema,
  mainUncertainty: InsightSchema, verdictChangingConditions: z.array(InsightSchema).min(1).max(8),
  metricScores: z.array(MetricDecisionSchema).min(5).max(8),
});
export const VerdictSchema = z.enum(["Bullish", "Neutral", "Bearish"]);
export const FinalDecisionSchema = OrchestratorSchema.extend({
  overallScore: score, verdict: VerdictSchema, confidence: score,
  confidenceBreakdown: z.strictObject({ evidenceQuality: score, stageAgreement: score, analystConfidence: score, explanation: text }),
  methodologyExplanation: text,
});
export const PromptVersionsSchema = z.strictObject({ research: text, methodology: text, bull: text, bear: text, orchestrator: text });
export const SavedAnalysisSchema = z.strictObject({
  id: z.uuid(), ticker: z.string().min(1).max(11), companyName: text, verdict: VerdictSchema,
  overallScore: score, confidence: score, research: ResearchPacketSchema, methodology: MethodologySchema,
  bullCase: BullCaseSchema, bearCase: BearCaseSchema, decision: FinalDecisionSchema,
  researchTimestamp: z.iso.datetime(), createdAt: z.iso.datetime(), model: text,
  promptVersion: text, promptVersions: PromptVersionsSchema, researchHash: z.string().length(64),
  cacheKey: text, cacheExpiresAt: z.iso.datetime(),
});
export type ResearchPacket = z.infer<typeof ResearchPacketSchema>;
export type Methodology = z.infer<typeof MethodologySchema>;
export type BullCase = z.infer<typeof BullCaseSchema>;
export type BearCase = z.infer<typeof BearCaseSchema>;
export type AnalystCase = BullCase | BearCase;
export type OrchestratorAssessment = z.infer<typeof OrchestratorSchema>;
export type FinalDecision = z.infer<typeof FinalDecisionSchema>;
export type SavedAnalysis = z.infer<typeof SavedAnalysisSchema>;
export type Insight = z.infer<typeof InsightSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type HistoryItem = Pick<SavedAnalysis, "id" | "ticker" | "companyName" | "verdict" | "overallScore" | "confidence" | "createdAt" | "cacheExpiresAt">;

export const STAGES = ["research", "methodology", "bull", "bear", "orchestrator", "saving"] as const;
export type Stage = typeof STAGES[number];
export type StageStatus = "pending" | "running" | "complete" | "failed";
export type Job = {
  id: string; ticker: string; status: "running" | "complete" | "failed";
  stages: Record<Stage, StageStatus>; createdAt: string; updatedAt: string;
  analysisId: string | null; error: string | null;
};
export type StartResponse = { cached: true; analysis: SavedAnalysis } | { cached: false; job: Job; duplicate: boolean };
