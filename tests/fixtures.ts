import { randomUUID } from "node:crypto";
import { RESEARCH_TOPICS, type ResearchPacket, type Methodology, type BullCase, type BearCase, type Insight, type OrchestratorAssessment, type SavedAnalysis } from "../src/lib/schemas";
import { finalizeDecision } from "../src/lib/scoring";
import { cacheExpiration, cacheKey, researchHash } from "../src/lib/cache";
import { PROMPT_VERSION, PROMPT_VERSIONS } from "../src/server/ai/prompts";
// Entirely fictional test evidence. Never seeded into the application database.
export function fixture(asOf = new Date().toISOString()) {
  const research: ResearchPacket = {
    ticker: "TEST", companyName: "Fictional Test Company", sector: "Test sector", industry: "Test industry", companySourceIds: ["S1"],
    ...Object.fromEntries(RESEARCH_TOPICS.map((topic, i) => [topic, [{ id: `C${i + 1}`, text: `Fictional fixture evidence for ${topic}.`, kind: "fact", status: "supported", sourceIds: ["S1"], observedAt: "Fictional test period" }]])) as Pick<ResearchPacket, typeof RESEARCH_TOPICS[number]>,
    sources: [{ id: "S1", url: "https://example.com/fictional-test-evidence", title: "Fictional fixture, not investment research", publisher: "Test fixture", type: "other", publishedAt: null, retrievedAt: asOf }], asOf,
  };
  const methodology: Methodology = { explanation: "A fictional test framework fixed before the cases.", horizon: "12–24 months", metrics: ["Growth", "Profitability", "Financial strength", "Valuation", "Competitive moat"].map((name, i) => ({ id: `M${i + 1}`, name, description: "Test metric.", weight: 20, rationale: "Test rationale.", evidenceRequired: ["Dated filing"], scoringGuidance: "0 no support, 50 mixed, 100 compelling evidence for that side." })) };
  const insight: Insight = { text: "A fictional interpretation for a test.", claimIds: ["C1"], sourceIds: ["S1"] };
  const common = { summary: "Fictional test thesis.", arguments: Array.from({ length: 3 }, (_, i) => ({ title: `Test argument ${i + 1}`, explanation: "Conditional test interpretation.", evidence: [insight], metricIds: ["M1"], counterEvidence: [insight] })), catalysts: [insight], conditions: [insight], risksAndUncertainties: [insight], confidence: 80, sourceIds: ["S1"] };
  const bullCase: BullCase = { ...common, side: "bull", metricAssessments: methodology.metrics.map(m => ({ metricId: m.id, strengthScore: 80 })) };
  const bearCase: BearCase = { ...common, side: "bear", metricAssessments: methodology.metrics.map(m => ({ metricId: m.id, strengthScore: 30 })) };
  const assessment: OrchestratorAssessment = { summary: "Fictional balance of evidence for testing.", strongestBullishFactor: insight, strongestBearishFactor: insight, mainUncertainty: insight, verdictChangingConditions: [insight], metricScores: methodology.metrics.map(m => ({ metricId: m.id, weight: m.weight, bullScore: 80, bearScore: 30, netMetricScore: 75, evidence: [insight], explanation: "Fictional adjudication.", dataQualityConfidence: 90 })) };
  const decision = finalizeDecision(methodology, assessment, bullCase, bearCase);
  const saved: SavedAnalysis = { id: randomUUID(), ticker: research.ticker, companyName: research.companyName, verdict: decision.verdict, overallScore: decision.overallScore, confidence: decision.confidence, research, methodology, bullCase, bearCase, decision, researchTimestamp: asOf, createdAt: asOf, model: "gpt-5.4", promptVersion: PROMPT_VERSION, promptVersions: PROMPT_VERSIONS, researchHash: researchHash(research), cacheKey: cacheKey(research.ticker, asOf, "gpt-5.4", PROMPT_VERSION), cacheExpiresAt: cacheExpiration(new Date(asOf), 24) };
  return { research, methodology, bullCase, bearCase, assessment, saved, insight };
}
