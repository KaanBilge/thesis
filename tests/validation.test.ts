import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import { BearCaseSchema, BullCaseSchema, FinalDecisionSchema, MethodologySchema, OrchestratorSchema, ResearchPacketSchema, SavedAnalysisSchema, SourceSchema, TickerSchema } from "../src/lib/schemas";
import { validateCase, validateOrchestrator, validateResearch } from "../src/lib/validation";
import { fixture } from "./fixtures";
describe("strict schemas and source integrity", () => {
  it.each(["AAPL", "BRK.B", "VOD.L", "0700.HK"].slice(0, 3))("accepts ticker %s", ticker => { expect(TickerSchema.parse(ticker)).toBe(ticker); });
  it("normalizes ticker input", () => { expect(TickerSchema.parse(" aapl ")).toBe("AAPL"); });
  it.each(["", "AAPL;DROP", "$(whoami)", "<script>", "AAAAAAAAAAAA", "AAPL TSLA", "../a"])("rejects ticker %s", ticker => { expect(TickerSchema.safeParse(ticker).success).toBe(false); });
  it("accepts a complete fictional fixture", () => {
    const f = fixture();
    expect(SavedAnalysisSchema.safeParse(f.saved).success).toBe(true);
    validateResearch(f.research, "TEST", new Set(f.research.sources.map(s => s.url)), f.research.asOf);
    validateCase(f.bullCase, f.research, f.methodology); validateCase(f.bearCase, f.research, f.methodology);
    validateOrchestrator(f.assessment, f.research, f.methodology);
  });
  it("rejects missing fields and additional properties", () => {
    expect(SavedAnalysisSchema.safeParse({ ...fixture().saved, secretOverride: 99 }).success).toBe(false);
    expect(ResearchPacketSchema.safeParse({ ticker: "AAPL" }).success).toBe(false);
  });
  it("rejects unsourced facts", () => {
    const { research } = fixture(); research.businessModel[0].sourceIds = [];
    expect(() => validateResearch(research, "TEST", new Set(research.sources.map(s => s.url)), research.asOf)).toThrow(/Facts need sources/);
  });
  it("rejects invented URLs absent from search provenance", () => {
    const { research } = fixture();
    expect(() => validateResearch(research, "TEST", new Set(["https://example.com/unrelated"]), research.asOf)).toThrow(/provenance/);
  });
  it.each(["javascript:alert(1)", "data:text/html,hello", "https://user:password@example.com", "https://"])("rejects unsafe source URL %s", url => { expect(SourceSchema.safeParse({ ...fixture().research.sources[0], url }).success).toBe(false); });
  it("rejects mismatched company ticker and timestamp", () => {
    const { research } = fixture(); const urls = new Set(research.sources.map(s => s.url));
    expect(() => validateResearch(research, "AAPL", urls, research.asOf)).toThrow(/ticker/);
    expect(() => validateResearch(research, "TEST", urls, "2020-01-01T00:00:00.000Z")).toThrow(/asOf/);
  });
  it("rejects invented claims and removed original citations", () => {
    const f = fixture(); f.bullCase.arguments[0].evidence[0].claimIds = ["invented"];
    expect(() => validateCase(f.bullCase, f.research, f.methodology)).toThrow(/claim IDs/);
    f.bullCase.arguments[0].evidence[0].claimIds = ["C1"]; f.bullCase.arguments[0].evidence[0].sourceIds = [];
    expect(() => validateCase(f.bullCase, f.research, f.methodology)).toThrow(/original source/);
  });
  it("rejects incorrect net arithmetic and high confidence on missing data", () => {
    const f = fixture(); f.assessment.metricScores[0].netMetricScore = 99;
    expect(() => validateOrchestrator(f.assessment, f.research, f.methodology)).toThrow(/netMetricScore/);
    f.assessment.metricScores[0].netMetricScore = 75; f.research.businessModel[0].kind = "uncertainty";
    expect(() => validateOrchestrator(f.assessment, f.research, f.methodology)).toThrow(/quality at most 25/);
  });
  it("exports strict JSON schemas without unsupported URL formats or optional object fields", () => {
    const visit = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const s = node as Record<string, unknown>;
      if (s.type === "object") { expect(s.additionalProperties).toBe(false); expect(s.required).toEqual(Object.keys(s.properties as object)); }
      if (s.format) expect(["date-time", "time", "date", "duration", "email", "hostname", "ipv4", "ipv6", "uuid"]).toContain(s.format);
      Object.values(s).forEach(visit);
    };
    for (const schema of [ResearchPacketSchema, MethodologySchema, BullCaseSchema, BearCaseSchema, OrchestratorSchema, FinalDecisionSchema, SavedAnalysisSchema]) {
      const format = zodTextFormat(schema, "Test"); expect(format.strict).toBe(true); visit(format.schema);
    }
  });
});
