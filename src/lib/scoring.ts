import { MethodologySchema, type Methodology, type OrchestratorAssessment, type AnalystCase, type FinalDecision } from "./schemas";

export function verdictForScore(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error("Overall score must be an integer from 0 to 100.");
  return value >= 65 ? "Bullish" : value >= 45 ? "Neutral" : "Bearish";
}
export function netScore(bull: number, bear: number) { return (bull + (100 - bear)) / 2; }
export function calculateScore(methodology: Methodology, rows: OrchestratorAssessment["metricScores"]) {
  MethodologySchema.parse(methodology);
  if (rows.length !== methodology.metrics.length || new Set(rows.map(r => r.metricId)).size !== rows.length)
    throw new Error("The scorecard must contain each methodology metric exactly once.");
  return Math.round(methodology.metrics.reduce((sum, metric) => {
    const row = rows.find(r => r.metricId === metric.id);
    if (!row || row.weight !== metric.weight) throw new Error("Scorecard weights must match the frozen methodology.");
    if (![row.bullScore, row.bearScore].every(s => Number.isInteger(s) && s >= 0 && s <= 100)) throw new Error("Metric scores must be integers between 0 and 100.");
    return sum + netScore(row.bullScore, row.bearScore) * metric.weight / 100;
  }, 0));
}
export function finalizeDecision(methodology: Methodology, assessment: OrchestratorAssessment, bull: AnalystCase, bear: AnalystCase): FinalDecision {
  const overallScore = calculateScore(methodology, assessment.metricScores);
  const evidenceQuality = Math.round(assessment.metricScores.reduce((sum, r) => sum + r.dataQualityConfidence * r.weight / 100, 0));
  const stageAgreement = Math.round(methodology.metrics.reduce((sum, metric) => {
    const b = bull.metricAssessments.find(m => m.metricId === metric.id);
    const r = bear.metricAssessments.find(m => m.metricId === metric.id);
    if (!b || !r) throw new Error("Analyst assessments must cover every methodology metric.");
    return sum + (100 - Math.abs(b.strengthScore - (100 - r.strengthScore))) * metric.weight / 100;
  }, 0));
  const analystConfidence = Math.min(bull.confidence, bear.confidence);
  const confidence = Math.min(evidenceQuality, Math.round(0.6 * evidenceQuality + 0.25 * stageAgreement + 0.15 * analystConfidence));
  return {
    ...assessment,
    metricScores: methodology.metrics.map(metric => {
      const row = assessment.metricScores.find(r => r.metricId === metric.id)!;
      return { ...row, weight: metric.weight, netMetricScore: netScore(row.bullScore, row.bearScore) };
    }),
    overallScore, verdict: verdictForScore(overallScore), confidence,
    confidenceBreakdown: { evidenceQuality, stageAgreement, analystConfidence,
      explanation: "60% evidence quality + 25% agreement between the analysts + 15% the lower analyst confidence, capped by evidence quality. Agreement compares bullish strength with 100 minus bearish strength. Confidence is a research-quality indicator, not a probability of a return." },
    methodologyExplanation: methodology.explanation,
  };
}
