import { RESEARCH_TOPICS, type ResearchPacket, type Methodology, type AnalystCase, type Insight, type OrchestratorAssessment } from "./schemas";
import { calculateScore, netScore } from "./scoring";
export class EvidenceError extends Error {}
function requireValid(condition: boolean, message: string): asserts condition {
  if (!condition) throw new EvidenceError(message);
}
export const allClaims = (r: ResearchPacket) => RESEARCH_TOPICS.flatMap(topic => r[topic]);
export function validateResearch(r: ResearchPacket, ticker: string, retrievedUrls: Set<string>, asOf: string) {
  requireValid(r.ticker === ticker, "The research ticker must match the requested ticker.");
  requireValid(r.asOf === asOf, "Use the supplied asOf timestamp exactly.");
  const sourceIds = new Set(r.sources.map(s => s.id));
  requireValid(sourceIds.size === r.sources.length, "Source IDs must be unique.");
  for (const source of r.sources) {
    requireValid(retrievedUrls.has(source.url), "Every source URL must appear in the actual web-search provenance.");
    requireValid(source.retrievedAt === asOf, "Use the supplied retrieval timestamp exactly.");
  }
  requireValid(r.companySourceIds.every(id => sourceIds.has(id)), "Company identification must reference existing sources.");
  const claims = allClaims(r);
  requireValid(new Set(claims.map(c => c.id)).size === claims.length, "Claim IDs must be globally unique.");
  for (const claim of claims) {
    requireValid(claim.sourceIds.every(id => sourceIds.has(id)), "A research claim references a missing source.");
    requireValid(claim.kind !== "fact" || (claim.sourceIds.length > 0 && claim.status === "supported"), "Facts need sources and supported status; mark missing, conflicting, or uncertain information as uncertainty.");
    requireValid(claim.kind !== "fact" || claim.observedAt !== null, "Facts must include the period or date to which they apply.");
    requireValid(claim.kind !== "interpretation" || claim.sourceIds.length > 0, "Interpretations must reference their underlying sources.");
  }
}
export function validateInsight(i: Insight, r: ResearchPacket, needsEvidence = false) {
  const claims = allClaims(r);
  requireValid(i.sourceIds.every(id => r.sources.some(s => s.id === id)), "Use only source IDs from the frozen packet.");
  requireValid(i.claimIds.every(id => claims.some(c => c.id === id)), "Use only claim IDs from the frozen packet.");
  if (needsEvidence) requireValid(i.claimIds.length > 0, "Supporting evidence must reference at least one frozen research claim; an explicit data gap may be cited as uncertainty.");
  const requiredSources = i.claimIds.flatMap(id => claims.find(c => c.id === id)!.sourceIds);
  requireValid(requiredSources.every(id => i.sourceIds.includes(id)), "Include the original source references for each cited research claim.");
}
export function validateCase(c: AnalystCase, r: ResearchPacket, m: Methodology) {
  const ids = new Set(m.metrics.map(metric => metric.id));
  requireValid(c.metricAssessments.length === ids.size && new Set(c.metricAssessments.map(a => a.metricId)).size === ids.size && c.metricAssessments.every(a => ids.has(a.metricId)), "Assess each frozen methodology metric exactly once.");
  requireValid(c.sourceIds.every(id => r.sources.some(s => s.id === id)), "Case source references must exist in the packet.");
  for (const argument of c.arguments) {
    requireValid(argument.metricIds.every(id => ids.has(id)), "Arguments must reference existing methodology metrics.");
    argument.evidence.forEach(i => validateInsight(i, r, true));
    argument.counterEvidence.forEach(i => validateInsight(i, r));
  }
  [...c.catalysts, ...c.conditions, ...c.risksAndUncertainties].forEach(i => validateInsight(i, r));
}
export function validateOrchestrator(a: OrchestratorAssessment, r: ResearchPacket, m: Methodology) {
  try { calculateScore(m, a.metricScores); } catch { throw new EvidenceError("Use every frozen metric exactly once with unchanged weights and scores in range."); }
  for (const row of a.metricScores) {
    requireValid(row.netMetricScore === netScore(row.bullScore, row.bearScore), "netMetricScore must equal (bullScore + 100 - bearScore) / 2 exactly.");
    row.evidence.forEach(i => validateInsight(i, r, true));
    const claims = row.evidence.flatMap(i => i.claimIds).map(id => allClaims(r).find(c => c.id === id)!);
    if (claims.every(c => c.kind === "uncertainty")) requireValid(row.dataQualityConfidence <= 25, "A metric supported only by uncertain or missing information must have data quality at most 25.");
  }
  [a.strongestBullishFactor, a.strongestBearishFactor, a.mainUncertainty, ...a.verdictChangingConditions].forEach(i => validateInsight(i, r, true));
}
