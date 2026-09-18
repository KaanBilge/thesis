import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { artifactHash, byteHash, confinedPath, inspectRun, readJson, scoreReview, writeJson, type Artifacts } from "./artifacts";
import { BASELINE_MODEL, IncompleteSchema, RunSchema } from "./contracts";

function escape(value: string) { return value.replace(/[\\`*{}\[\]<>|]/g, "\\$&").replace(/\r/g, ""); }
function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "Not estimable"; }
function percent(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? `${number(value * 100)}%` : "Not estimable"; }
function citations(a: Artifacts, claimIds: string[]) {
  const sources = [...new Set(claimIds.flatMap(id => a.evidence.claims.find(c => c.id === id)?.sourceIds ?? []))];
  return sources.map(id => { const s = a.evidence.sources.find(item => item.id === id)!; return `[${s.id}](${s.url})`; }).join(", ");
}
function insight(a: Artifacts, value: { text: string; claimIds: string[] }) { return `${escape(value.text)} ${citations(a, value.claimIds)}`; }

export function renderRun(directory: string) {
  const { artifacts: a, validation } = inspectRun(directory, true);
  if (!a?.review) throw new Error(`Cannot render incomplete artifacts: ${validation.errors.map(e => e.message).join("; ")}`);
  const audit = scoreReview(a.review, validation);
  // Invalid lineage/arithmetic must be fixed before even rendering a numerical draft.
  if (!validation.valid) throw new Error(`Fix artifact validation before rendering: ${validation.errors.map(e => e.message).join("; ")}`);
  const draft = audit.status !== "pass";
  const modelWarnings = [...new Set(a.valuation.scenarios.flatMap(s => [...s.fairValue.warnings, ...s.horizonValue.warnings]))];
  const lines = [
    `# ${escape(a.evidence.companyName)} (${a.run.ticker})`, "",
    draft ? "**DRAFT — independent audit requires revision.**" : "**Independent audit: passed the research-quality rubric.**", "",
    `Research cutoff: ${a.run.asOf} · Horizon: ${a.run.horizonMonths} months · Model: gpt-6-astra`, "",
    `**Conclusion: ${escape(a.synthesis.conclusion)}.** ${insight(a, a.synthesis.summary)}`, "",
    `Market price used: **${number(a.valuationInput.marketPrice.value)} ${a.evidence.listing.currency}**. Quote observation: ${escape(a.valuationInput.marketPrice.observedAt)}.`, "",
    "## Valuation and entry", "",
    "Prices below use the same share and currency basis. Fair value is estimated at the research date; the horizon price is a separate scenario, conditional on its assumptions.", "",
    "| Scenario | Fair value today | Horizon price | Total return | Annualized return | Entry ceiling |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...a.valuation.scenarios.map(s => `| ${s.name} | ${number(s.fairValue.perShareValue)} | ${number(s.horizonValue.perShareValue)} | ${percent(s.returns.totalReturn)} | ${percent(s.returns.annualizedTotalReturn)} | ${number(s.entry.entryCeiling)} |`), "",
    insight(a, a.synthesis.baseCaseRationale), "", insight(a, a.synthesis.entryRationale), "",
    "Entry ceilings are conditional outputs of the stated return requirement and margin of safety; they are not guaranteed buying opportunities. Cash-dividend assumptions and timing are recorded with the calculations.", "",
    "## Bull case", "", insight(a, a.synthesis.strongestBullish), "",
    ...a.bull.arguments.flatMap(item => [`**${escape(item.title)}.** ${escape(item.reasoning)} ${citations(a, item.claimIds)}`, "", `Counterevidence: ${escape(item.counterArgument)} ${citations(a, item.counterEvidenceClaimIds)}`, ""]),
    "## Bear case", "", insight(a, a.synthesis.strongestBearish), "",
    ...a.bear.arguments.flatMap(item => [`**${escape(item.title)}.** ${escape(item.reasoning)} ${citations(a, item.claimIds)}`, "", `Counterevidence: ${escape(item.counterArgument)} ${citations(a, item.counterEvidenceClaimIds)}`, ""]),
    "## Assumptions that decide the outcome", "",
    ...a.synthesis.disputes.map(d => `- **${escape(a.framework.drivers.find(item => item.id === d.driverId)?.name ?? d.driverId)}:** ${escape(d.resolution)} ${citations(a, d.claimIds)}`), "",
    "## Catalysts within the horizon", "", ...a.synthesis.catalysts.map(v => `- ${insight(a, v)}`), "",
    "## Risks and change conditions", "", ...a.synthesis.risks.map(v => `- ${insight(a, v)}`), "",
    ...a.synthesis.changeConditions.map(v => `- Reassess when: ${insight(a, v)}`), "",
    "## Limitations and audit", "", ...a.synthesis.limitations.map(v => `- ${escape(v)}`),
    ...a.valuation.warnings.map(v => `- ${escape(v)}`), "",
    ...modelWarnings.map(v => `- ${escape(v)}`), "",
    `Research-quality score: **${audit.qualityScore}/100** (${audit.status}). This is an evaluator judgment about research quality, not a probability of a profitable investment.`, "",
    ...audit.blockers.map(f => `- ${f.severity}: ${escape(f.description)} — ${escape(f.remediation)}`), "",
    "Sources, assumptions, calculations and audit details accompany this brief in the research record.", "",
  ];
  const record = [
    `# Research record — ${a.run.ticker}`, "", `Cutoff: ${a.run.asOf}. Horizon: ${a.run.horizonMonths} months.`, "",
    "## Sources", "",
    ...a.evidence.sources.map(s => `- **${s.id}: [${escape(s.title)}](${s.url})** — ${escape(s.publisher)}; published ${s.publishedAt ?? "unknown"}; retrieved ${s.retrievedAt}${s.rawFile ? `; snapshot ${escape(s.rawFile)}; SHA-256 ${s.rawSha256}` : "; no local snapshot"}.`), "",
    "## Claims and uncertainties", "",
    ...a.evidence.claims.map(c => `- **${c.id} [${c.kind}; ${c.status}; observed ${escape(c.observedAt)}]:** ${escape(c.text)} ${citations(a, [c.id])}${c.financialValue ? ` Value: ${c.financialValue.value} ${escape(c.financialValue.unit)}; currency ${c.financialValue.currency ?? "n/a"}; period ${c.financialValue.periodStart ?? "instant"} to ${c.financialValue.periodEnd}.` : ""}`), "",
    "## Coverage", "", ...a.evidence.coverage.map(c => `- ${c.area}: ${c.status}. ${c.limitations.map(escape).join(" ")}`), "",
    "## Methodology", "", escape(a.framework.methodology), "", escape(a.framework.methodRationale), "",
    "## Scenario assumptions and calculations", "",
    "The following are the exact validated inputs and deterministic outputs. Observations and assumptions are labeled explicitly; rates use decimals and units are declared.", "",
    "```json", JSON.stringify({ input: a.valuationInput, output: a.valuation }, null, 2), "```", "",
    "## Independent case conditions", "",
    ...([a.bull, a.bear]).flatMap(c => [
      `### ${c.side}`, "",
      ...c.assumptions.map(v => `- ${escape(v.driverId)} = ${escape(v.value)}: ${escape(v.rationale)} ${citations(a, v.claimIds)}`), "",
      ...c.invalidationConditions.map(v => `- Invalidation: ${escape(v.condition)}; ${escape(v.metric)}; ${escape(v.threshold)} ${citations(a, v.claimIds)}`), "",
    ]),
    "## Audit", "", "| Dimension | Score / 4 | Weight | Rationale |", "| --- | ---: | ---: | --- |",
    ...audit.dimensions.map(d => `| ${d.name} | ${d.score} | ${d.weight}% | ${escape(a.review!.dimensions.find(v => v.id === d.id)!.rationale).replace(/\n/g, " ")} |`), "",
    ...a.review.findings.map(f => `- **${f.id} ${f.severity}, ${f.status}:** ${escape(f.description)} Fix: ${escape(f.remediation)} Evidence: ${f.artifactRefs.map(escape).join(", ")}. ${f.resolutionEvidence.map(escape).join(" ")}`), "",
    "## Provenance", "",
    "Worker context metadata is supplied by the orchestrator. Hash validation detects changed artifacts; it does not prove semantic correctness or enforce filesystem isolation.", "",
    "```json", JSON.stringify({ modelPolicy: a.run.modelPolicy, workers: { framework: a.framework.worker, bull: a.bull.worker, bear: a.bear.worker, synthesis: a.synthesis.worker, evaluator: a.review.worker }, hashes: validation.hashes }, null, 2), "```", "",
    ...["raw-financial-notes.md", "workflow-record.md", "audit-notes.md"].flatMap(file => [
      `## ${file.replace(".md", "").replaceAll("-", " ")}`, "", escape(readFileSync(confinedPath(directory, file), "utf8")), "",
    ]),
    "## Usage", "", "Missing model telemetry is not zero consumption; no savings are claimed by this baseline.", "",
    ...(existsSync(join(directory, "usage.json")) ? ["```json", JSON.stringify(readJson(confinedPath(directory, "usage.json")), null, 2), "```", ""] : ["Usage telemetry unavailable.", ""]),
    ...validation.warnings.map(w => `- ${escape(w.message)}`), "",
  ];
  const report = lines.join("\n"), researchRecord = record.join("\n");
  if (Buffer.byteLength(report) > 1_000_000 || Buffer.byteLength(researchRecord) > 1_000_000) throw new Error("Rendered documents exceed the Thesis import limit. Reduce redundant evidence without losing material coverage.");
  writeFileSync(join(directory, "report.md"), report, "utf8");
  writeFileSync(join(directory, "research-record.md"), researchRecord, "utf8");
  writeJson(join(directory, "audit-result.json"), audit);
  writeJson(join(directory, "publication.json"), {
    version: 1, status: audit.status, hashes: validation.hashes,
    reportHash: byteHash(Buffer.from(report)), researchRecordHash: byteHash(Buffer.from(researchRecord)),
  });
  return { status: audit.status, qualityScore: audit.qualityScore, report: join(directory, "report.md"), researchRecord: join(directory, "research-record.md") };
}

export function assertPublishable(directory: string) {
  const { artifacts, validation } = inspectRun(directory, true);
  if (!artifacts?.review || scoreReview(artifacts.review, validation).status !== "pass") throw new Error("The analyst run has not passed its current independent audit. Resolve findings and rerun affected stages before importing.");
  const publication = readJson(confinedPath(directory, "publication.json")) as Record<string, unknown>;
  if (publication.status !== "pass" || artifactHash(publication.hashes) !== artifactHash(validation.hashes) ||
    publication.reportHash !== byteHash(readFileSync(confinedPath(directory, "report.md"))) ||
    publication.researchRecordHash !== byteHash(readFileSync(confinedPath(directory, "research-record.md")))) throw new Error("The rendered brief is stale or changed. Run analyst render again after the audit passes.");
  return artifacts;
}

export function renderIncompleteRun(directory: string, input: unknown) {
  const run = RunSchema.parse(readJson(confinedPath(directory, "run.json"))), draft = IncompleteSchema.parse(input);
  if (artifactHash(run) !== draft.runHash) throw new Error("Incomplete assessment must match the current run hash.");
  if (draft.worker.model !== BASELINE_MODEL || ["low", "medium"].includes(draft.worker.reasoningEffort)) throw new Error("Incomplete financial assessments must use the Astra quality baseline.");
  const report = [`# ${run.ticker} — incomplete research`, "", "**DRAFT — insufficient evidence or unsupported valuation. No audited valuation or actionable entry is available.**", "",
    `Cutoff: ${run.asOf}. Horizon: ${run.horizonMonths} months.`, "", escape(draft.summary), "", "## Unresolved requirements", "",
    ...draft.reasons.map(reason => `- ${escape(reason)}`), "", "## Next steps", "", ...draft.nextSteps.map(step => `- ${escape(step)}`), ""].join("\n");
  const record = [`# Incomplete research record — ${run.ticker}`, "", "No completed-brief audit score is assigned. Preserve any collected source artifacts in this run directory; they have not been certified by this draft.", "", "```json", JSON.stringify(draft, null, 2), "```", ""].join("\n");
  writeJson(join(directory, "incomplete.json"), draft);
  writeFileSync(join(directory, "report.md"), report, "utf8"); writeFileSync(join(directory, "research-record.md"), record, "utf8");
  writeJson(join(directory, "publication.json"), { version: 1, status: "incomplete", reportHash: byteHash(Buffer.from(report)), researchRecordHash: byteHash(Buffer.from(record)) });
  return { status: "incomplete", report: join(directory, "report.md"), researchRecord: join(directory, "research-record.md") };
}
