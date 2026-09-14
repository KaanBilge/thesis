import { describe, expect, it } from "vitest";
import { MethodologySchema } from "../src/lib/schemas";
import { calculateScore, finalizeDecision, netScore, verdictForScore } from "../src/lib/scoring";
import { fixture } from "./fixtures";
describe("precommitted methodology", () => {
  it("accepts 5–8 unique metrics with integer weights totaling 100", () => { expect(MethodologySchema.safeParse(fixture().methodology).success).toBe(true); });
  it.each([99, 101])("rejects weights totaling %s", total => {
    const { methodology } = fixture(); methodology.metrics[0].weight += total - 100;
    expect(MethodologySchema.safeParse(methodology).success).toBe(false);
  });
  it("rejects duplicate metric IDs", () => {
    const { methodology } = fixture(); methodology.metrics[1].id = "M1";
    expect(MethodologySchema.safeParse(methodology).success).toBe(false);
  });
  it("rejects fewer than five metrics", () => { const { methodology } = fixture(); methodology.metrics.pop(); expect(MethodologySchema.safeParse(methodology).success).toBe(false); });
});
describe("deterministic arithmetic", () => {
  it("calculates independent opposing evidence scores", () => { expect(netScore(100, 0)).toBe(100); expect(netScore(0, 100)).toBe(0); expect(netScore(80, 80)).toBe(50); });
  it("weights net scores and rounds only the final aggregate", () => {
    const { methodology, assessment } = fixture();
    const weights = [33, 27, 20, 15, 5];
    methodology.metrics.forEach((m, i) => { m.weight = weights[i]; });
    const bull = [83, 65, 92, 48, 30], bear = [36, 44, 29, 77, 63];
    assessment.metricScores.forEach((r, i) => { r.weight = weights[i]; r.bullScore = bull[i]; r.bearScore = bear[i]; r.netMetricScore = 0; });
    expect(calculateScore(methodology, assessment.metricScores)).toBe(64); // unrounded 63.89
  });
  it("does not accept changed weights or missing/duplicate metrics", () => {
    const { methodology, assessment } = fixture();
    expect(() => calculateScore(methodology, assessment.metricScores.slice(1))).toThrow();
    assessment.metricScores[0].weight = 50;
    expect(() => calculateScore(methodology, assessment.metricScores)).toThrow();
    assessment.metricScores[0] = assessment.metricScores[1];
    expect(() => calculateScore(methodology, assessment.metricScores)).toThrow();
  });
  it.each([-1, 101, NaN, Infinity, 20.5])("rejects invalid metric score %s", value => { const f = fixture(); f.assessment.metricScores[0].bullScore = value; expect(() => calculateScore(f.methodology, f.assessment.metricScores)).toThrow(); });
  it.each([[0, "Bearish"], [44, "Bearish"], [45, "Neutral"], [64, "Neutral"], [65, "Bullish"], [100, "Bullish"]])("maps %s to %s", (score, verdict) => { expect(verdictForScore(score as number)).toBe(verdict); });
  it("keeps confidence independent of direction and sensitive to disagreement", () => {
    const f = fixture();
    const good = finalizeDecision(f.methodology, f.assessment, f.bullCase, f.bearCase);
    f.bearCase.metricAssessments.forEach(m => { m.strengthScore = 95; });
    const disagreement = finalizeDecision(f.methodology, f.assessment, f.bullCase, f.bearCase);
    expect(disagreement.overallScore).toBe(good.overallScore);
    expect(disagreement.confidence).toBeLessThan(good.confidence);
    f.assessment.metricScores.forEach(m => { m.dataQualityConfidence = 20; });
    expect(finalizeDecision(f.methodology, f.assessment, f.bullCase, f.bearCase).confidence).toBeLessThanOrEqual(20);
  });
});
