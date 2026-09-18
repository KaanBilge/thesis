import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { artifactHash, byteHash, inspectRun, scoreReview, validateArtifacts, writeJson } from "../src/analyst/artifacts";
import { assertPublishable, renderIncompleteRun, renderRun } from "../src/analyst/render";
import { analystFixture, worker, writeFixture } from "./analyst-fixtures";
const roots: string[] = [];
const folder = () => { const path = mkdtempSync(join(tmpdir(), "thesis-analyst-test-")); roots.push(path); return path; };
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe("analyst lineage and quality gates", () => {
  it("hashes equivalent JSON consistently without ignoring changed array order or values", () => {
    expect(artifactHash({ b: 1, a: [1, 2] })).toBe(artifactHash({ a: [1, 2], b: 1 }));
    expect(artifactHash({ a: [2, 1], b: 1 })).not.toBe(artifactHash({ a: [1, 2], b: 1 }));
  });
  it("accepts coherent synthetic artifacts and a correctly weighted test grade", () => {
    const a = analystFixture(); const validation = validateArtifacts(a);
    expect(validation.errors).toEqual([]);
    a.review!.dimensions.find(d => d.id === "adversarial")!.score = 3;
    expect(scoreReview(a.review!, validation).qualityScore).toBe(96.25);
    expect(scoreReview(a.review!, validation).status).toBe("pass");
  });
  it("blocks high overall scores for a weak dimension, material defect or failed validation", () => {
    const a = analystFixture();
    a.review!.dimensions.find(d => d.id === "clarity")!.score = 2;
    expect(scoreReview(a.review!, validateArtifacts(a)).status).toBe("needs-revision");
    a.review!.dimensions.forEach(d => { d.score = 4; });
    a.review!.findings.push({ id: "F1", stage: "calculation", severity: "major", description: "Incorrect cash bridge", artifactRefs: ["valuation.json"], remediation: "Recompute", status: "open", resolutionEvidence: [] });
    expect(scoreReview(a.review!, validateArtifacts(a)).status).toBe("needs-revision");
    a.review!.findings = [];
    a.valuation.scenarios[0].fairValue.perShareValue = 1000;
    expect(validateArtifacts(a).errors.some(e => e.code === "CALCULATION_MISMATCH")).toBe(true);
    expect(scoreReview(a.review!, validateArtifacts(a)).status).toBe("needs-revision");
  });
  it("rejects changed evidence, inherited cases, shared contexts, and a self-review", () => {
    const a = analystFixture(); a.evidence.claims[1].text = "Changed input";
    a.bear.worker = a.bull.worker; a.bull.worker.historyMode = "inherited"; a.review!.worker.contextId = a.synthesis.worker.contextId;
    const codes = validateArtifacts(a).errors.map(e => e.code);
    expect(codes).toContain("STALE_INPUT"); expect(codes).toContain("CONTEXT_ISOLATION"); expect(codes).toContain("EVALUATOR_ISOLATION");
  });
  it("rejects a cheaper model, wrong issuer, stale or different quotes and unsourced claims", () => {
    const a = analystFixture(); a.bull.worker.model = "gpt-5.6-sol"; a.framework.ticker = "OTHER";
    a.evidence.claims[0].observedAt = "2025-01-01T00:00:00Z"; a.evidence.claims[0].sourceIds = [];
    a.valuationInput.marketPrice.value = 12;
    const codes = validateArtifacts(a).errors.map(e => e.code);
    for (const code of ["MODEL_POLICY", "ISSUER_MISMATCH", "QUOTE_FRESHNESS", "QUOTE_VALUE", "QUOTE_TIMESTAMP", "UNSOURCED_CLAIM"]) expect(codes).toContain(code);
  });
  it("does not let framework or synthesis inherit an author's conversation", () => {
    for (const stage of ["framework", "synthesis"] as const) {
      const a = analystFixture(); a[stage].worker.historyMode = "inherited";
      expect(validateArtifacts(a).errors.some(e => e.code === "CONTEXT_ISOLATION")).toBe(true);
    }
    const a = analystFixture(); a.synthesis.worker.contextId = a.bull.worker.contextId;
    expect(validateArtifacts(a).errors.some(e => e.code === "CONTEXT_ISOLATION")).toBe(true);
  });
  it("resolves actual audit references and detects changed local source snapshots", () => {
    const root = folder(), a = writeFixture(root);
    writeFileSync(join(root, "source.json"), "{}");
    a.evidence.sources[0].rawFile = "source.json"; a.evidence.sources[0].rawSha256 = byteHash(Buffer.from("{}"));
    writeJson(join(root, "evidence.json"), a.evidence);
    writeFileSync(join(root, "source.json"), '{"changed":true}');
    a.review!.dimensions[0].artifactRefs = ["evidence.json#/claims/10000"];
    writeJson(join(root, "review.json"), a.review);
    const errors = inspectRun(root, true).validation.errors;
    expect(errors.some(e => e.code === "SOURCE_SNAPSHOT")).toBe(true);
    expect(errors.some(e => e.code === "AUDIT_REFERENCE")).toBe(true);
  });
  it("requires financial, workflow and audit notes rather than declaring provenance from worker IDs", () => {
    const root = folder(); writeFixture(root); rmSync(join(root, "workflow-record.md"));
    expect(inspectRun(root, true).validation.errors.some(e => e.code === "RESEARCH_NOTES")).toBe(true);
  });
  it("renders a passing synthetic run, binds notes/documents, and blocks edits after audit", () => {
    const root = folder(); writeFixture(root);
    expect(renderRun(root).status).toBe("pass"); expect(assertPublishable(root).run.ticker).toBe("TEST");
    const record = readFileSync(join(root, "research-record.md"), "utf8");
    expect(record).toContain("Fictional test note"); expect(record).toContain("Usage telemetry unavailable");
    writeFileSync(join(root, "report.md"), "Changed report"); expect(() => assertPublishable(root)).toThrow("stale or changed");
    renderRun(root); writeFileSync(join(root, "workflow-record.md"), "Changed dispatch note"); expect(() => assertPublishable(root)).toThrow("not passed");
    expect(() => renderRun(root)).toThrow("workflowHash");
  });
  it("renders failed semantic audits as drafts, and renders missing valuations without fabricated values", () => {
    const root = folder(), a = writeFixture(root); a.review!.dimensions.forEach(d => { d.score = 2; }); writeJson(join(root, "review.json"), a.review);
    expect(renderRun(root).status).toBe("needs-revision"); expect(readFileSync(join(root, "report.md"), "utf8")).toContain("DRAFT");
    expect(() => assertPublishable(root)).toThrow("not passed");
    const draft = renderIncompleteRun(root, { version: 1, worker: worker("incomplete-test"), runHash: artifactHash(a.run), summary: "Quote unavailable.", reasons: ["No verified price"], nextSteps: ["Retrieve a dated quote"] });
    expect(draft.status).toBe("incomplete"); expect(readFileSync(draft.report, "utf8")).toContain("No audited valuation");
  });
  it("runs the CLI and guarded importer end to end without model API calls", () => {
    const root = folder(), runDir = join(root, "TEST", "20260131T200000Z"); writeFixture(runDir);
    const invoke = (script: string, args: string[]) => spawnSync(process.execPath, [join(process.cwd(), "node_modules/tsx/dist/cli.mjs"), join(process.cwd(), script), ...args], { encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "", THESIS_DATABASE_PATH: join(root, "test.sqlite") } });
    const audit = invoke("scripts/analyst.ts", ["audit", "--run", runDir]); expect(audit.status, audit.stderr).toBe(0);
    const render = invoke("scripts/analyst.ts", ["render", "--run", runDir]); expect(render.status, render.stderr).toBe(0);
    const imported = invoke("scripts/import-brief.ts", ["--dir", runDir]); expect(imported.status, imported.stderr).toBe(0);
    expect(JSON.parse(imported.stdout).status).toBe("saved");
    const again = invoke("scripts/import-brief.ts", ["--dir", runDir]); expect(JSON.parse(again.stdout).status).toBe("already-saved");
    writeFileSync(join(runDir, "report.md"), "Tampered final");
    expect(invoke("scripts/import-brief.ts", ["--dir", runDir]).status).toBe(1);
  }, 30_000);
});
