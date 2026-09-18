import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import {
  BASELINE_MODEL, COVERAGE_AREAS, RUBRIC, RunSchema, EvidenceSchema, FrameworkSchema,
  CaseSchema, SynthesisSchema, ReviewSchema, UsageSchema,
  type Run, type Evidence, type Framework, type AnalystCase, type Synthesis, type Review, type Worker,
} from "./contracts";
import { calculateValuation, ValuationInputSchema } from "./calculations";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}
export function artifactHash(value: unknown) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
export function byteHash(value: Buffer) { return createHash("sha256").update(value).digest("hex"); }
export function readJson(path: string): unknown {
  if (statSync(path).size > 10_000_000) throw new Error("JSON artifact exceeds 10 MB.");
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}
export function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", "utf8");
  renameSync(temporary, path);
}
export function confinedPath(root: string, name: string) {
  if (isAbsolute(name) || /^[A-Za-z]:/.test(name)) throw new Error("Artifact paths must be relative to the run directory.");
  const base = realpathSync(root), target = resolve(base, name);
  const check = (path: string) => { const part = relative(base, path); return part !== ".." && !part.startsWith(`..\\`) && !part.startsWith("../") && !isAbsolute(part); };
  if (!check(target) || (existsSync(target) && !check(realpathSync(target)))) throw new Error("Artifact path leaves the run directory.");
  return target;
}

export type Artifacts = {
  run: Run; evidence: Evidence; framework: Framework; bull: AnalystCase; bear: AnalystCase;
  valuationInput: z.infer<typeof ValuationInputSchema>;
  valuation: ReturnType<typeof calculateValuation>; synthesis: Synthesis; review?: Review;
  notes: { financial: string; workflow: string; audit?: string };
};
export type Diagnostic = { code: string; message: string };
export type Validation = { valid: boolean; errors: Diagnostic[]; warnings: Diagnostic[]; hashes: Record<string, string> };
export const FILES = {
  run: "run.json", evidence: "evidence.json", framework: "framework.json", bull: "bull.json", bear: "bear.json",
  valuationInput: "valuation-input.json", valuation: "valuation.json", synthesis: "synthesis.json", review: "review.json",
} as const;
function unique(values: string[]) { return new Set(values).size === values.length; }

export function validateArtifacts(a: Artifacts): Validation {
  const errors: Diagnostic[] = [], warnings: Diagnostic[] = [];
  const error = (code: string, message: string) => errors.push({ code, message });
  const warn = (code: string, message: string) => warnings.push({ code, message });
  const hashes = Object.fromEntries(Object.entries(a).map(([name, item]) => [`${name}Hash`, artifactHash(item)]));
  hashes.financialNotesHash = byteHash(Buffer.from(a.notes.financial));
  hashes.workflowHash = byteHash(Buffer.from(a.notes.workflow));
  if (a.notes.audit !== undefined) hashes.auditNotesHash = byteHash(Buffer.from(a.notes.audit));
  const sourceIds = new Set(a.evidence.sources.map(s => s.id)), claimIds = new Set(a.evidence.claims.map(c => c.id)), driverIds = new Set(a.framework.drivers.map(d => d.id));
  if (!unique([...a.evidence.sources.map(s => s.id), ...a.evidence.claims.map(c => c.id), ...a.framework.drivers.map(d => d.id)])) error("DUPLICATE_ID", "Source, claim and driver IDs must be unique across the evidence and framework.");
  function checkRefs(value: unknown, path: string) {
    if (Array.isArray(value)) { value.forEach((v, i) => checkRefs(v, `${path}/${i}`)); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      const known = key === "sourceIds" ? sourceIds : /claimIds$/i.test(key) ? claimIds : key === "driverIds" ? driverIds : null;
      if (known && Array.isArray(item)) for (const id of item) if (!known.has(id)) error("UNKNOWN_REFERENCE", `${path}/${key} refers to unknown ID ${id}.`);
      if (key === "driverId" && typeof item === "string" && !driverIds.has(item)) error("UNKNOWN_DRIVER", `${path} refers to unknown driver ${item}.`);
      checkRefs(item, `${path}/${key}`);
    }
  }
  checkRefs(a.evidence, "evidence"); checkRefs(a.framework, "framework");
  checkRefs(a.bull, "bull"); checkRefs(a.bear, "bear"); checkRefs(a.synthesis, "synthesis");
  checkRefs(a.valuationInput, "valuation-input");
  if (a.evidence.ticker !== a.run.ticker || a.framework.ticker !== a.run.ticker || a.valuationInput.ticker !== a.run.ticker) error("ISSUER_MISMATCH", "All artifacts must identify the run's exact ticker.");
  if (Date.parse(a.evidence.asOf) !== Date.parse(a.run.asOf) || Date.parse(a.valuationInput.asOf) !== Date.parse(a.run.asOf)) error("CUTOFF_MISMATCH", "Evidence and valuation must use the run's research cutoff.");
  if (a.framework.horizonMonths !== a.run.horizonMonths || a.valuationInput.horizonMonths !== a.run.horizonMonths) error("HORIZON_MISMATCH", "Framework and valuation must use the run's horizon.");
  if (!unique(a.evidence.coverage.map(c => c.area)) || !COVERAGE_AREAS.every(area => a.evidence.coverage.some(c => c.area === area))) error("COVERAGE", "Provide exactly one coverage entry per research area.");
  for (const coverage of a.evidence.coverage) {
    if (coverage.status === "complete" && !coverage.claimIds.length) error("COVERAGE", `Complete ${coverage.area} coverage needs evidence claims.`);
    if (coverage.status !== "complete") {
      warn("COVERAGE_GAP", `${coverage.area}: ${coverage.status}. ${coverage.limitations.join(" ")}`);
      if (!coverage.limitations.length) error("COVERAGE", `Explain the ${coverage.area} coverage limitation.`);
    }
  }
  for (const source of a.evidence.sources) {
    if (source.publishedAt && Date.parse(source.publishedAt) > Date.parse(a.run.asOf)) error("FUTURE_SOURCE", `${source.id} was published after the cutoff.`);
    if (source.publishedAt && Date.parse(source.retrievedAt) < Date.parse(source.publishedAt)) error("SOURCE_DATE", `${source.id} was reportedly retrieved before publication.`);
    if (!source.publishedAt) warn("UNKNOWN_PUBLICATION", `${source.id} has no verified publication timestamp; evaluator must assess availability.`);
    if (!!source.rawFile !== !!source.rawSha256) error("RAW_HASH", `${source.id} needs both rawFile and rawSha256, or neither.`);
  }
  for (const claim of a.evidence.claims) {
    if ((claim.kind === "fact" || claim.status === "supported") && !claim.sourceIds.length) error("UNSOURCED_CLAIM", `${claim.id} has no underlying source.`);
    if (claim.kind === "fact" && claim.status !== "supported") error("FACT_STATUS", `${claim.id}: unresolved evidence must be labeled uncertainty.`);
    if (claim.status === "conflicting" && claim.sourceIds.length < 2) error("CONFLICT", `${claim.id} must identify both conflicting sources.`);
    if (claim.financialValue?.periodStart && claim.financialValue.periodStart > claim.financialValue.periodEnd) error("PERIOD", `${claim.id} has an inverted financial period.`);
  }
  function checkBasis(name: string, basis: Record<string, string>) {
    for (const [key, value] of Object.entries(basis)) if (hashes[key] !== value) error("STALE_INPUT", `${name}.${key} does not match the current artifact. Rerun affected stages.`);
  }
  function checkWorker(name: string, worker: Worker, fresh: boolean) {
    if (worker.model !== BASELINE_MODEL || ["low", "medium"].includes(worker.reasoningEffort)) error("MODEL_POLICY", `${name} must use ${BASELINE_MODEL} with high or greater reasoning in the quality baseline.`);
    if (fresh && worker.historyMode !== "fresh") error("CONTEXT_ISOLATION", `${name} requires a fresh conversation with only its explicit inputs.`);
  }
  checkBasis("framework", a.framework.basis); checkWorker("framework", a.framework.worker, true);
  checkBasis("bull", a.bull.basis); checkWorker("bull", a.bull.worker, true);
  checkBasis("bear", a.bear.basis); checkWorker("bear", a.bear.worker, true);
  checkBasis("synthesis", a.synthesis.basis); checkWorker("synthesis", a.synthesis.worker, true);
  if (a.bull.side !== "bull" || a.bear.side !== "bear") error("SIDE", "bull.json and bear.json must contain their respective sides.");
  if (!unique([a.framework.worker.contextId, a.bull.worker.contextId, a.bear.worker.contextId, a.synthesis.worker.contextId])) error("CONTEXT_ISOLATION", "Framework, bull, bear and synthesis must use distinct fresh contexts.");
  for (const [name, side] of [["bull", a.bull], ["bear", a.bear]] as const) {
    if (!unique(side.arguments.map(argument => argument.id))) error("DUPLICATE_ARGUMENT", `${name} has duplicate argument IDs.`);
    for (const argument of side.arguments) if (argument.claimIds.every(id => a.evidence.claims.find(c => c.id === id)?.status === "missing")) error("MISSING_IS_NOT_EVIDENCE", `${name}/${argument.id} treats missing evidence as support for a directional argument.`);
    for (const driver of a.framework.drivers) if (!side.assumptions.some(item => item.driverId === driver.id)) error("DRIVER_COVERAGE", `${name} needs an explicit assumption or unchanged rationale for ${driver.id}.`);
  }
  const quote = a.evidence.claims.find(c => c.id === a.framework.quoteClaimId);
  if (!quote || quote.kind !== "fact" || quote.status !== "supported" || !quote.financialValue) error("QUOTE", "A valuation brief needs a verified numeric price claim selected by quoteClaimId.");
  else {
    const observed = Date.parse(quote.observedAt), age = (Date.parse(a.run.asOf) - observed) / 86400000;
    if (!Number.isFinite(age) || age < 0 || age > 7) error("QUOTE_FRESHNESS", "The selected quote needs a timestamp at or before cutoff, no more than 7 calendar days old.");
    if (!quote.sourceIds.some(id => a.evidence.sources.find(s => s.id === id)?.kind === "market")) error("QUOTE_SOURCE", "The price claim must cite a market-data source.");
    if (quote.financialValue.value !== a.valuationInput.marketPrice.value) error("QUOTE_VALUE", "Valuation marketPrice differs from the verified price claim.");
    if (Date.parse(quote.observedAt) !== Date.parse(a.valuationInput.marketPrice.observedAt)) error("QUOTE_TIMESTAMP", "Valuation quote timestamp must match the verified quote claim.");
    if (quote.financialValue.currency !== a.evidence.listing.currency || a.valuationInput.units.priceCurrency !== a.evidence.listing.currency) error("QUOTE_CURRENCY", "The quote, listing and valuation must use the same currency.");
  }
  for (const source of a.valuationInput.sources) {
    const original = a.evidence.sources.find(s => s.id === source.id);
    if (!original || original.url !== source.url) error("VALUATION_SOURCE", `Valuation source ${source.id} must match a source in the evidence packet.`);
  }
  try {
    if (artifactHash(calculateValuation(a.valuationInput)) !== artifactHash(a.valuation)) error("CALCULATION_MISMATCH", "valuation.json is not the deterministic result of valuation-input.json.");
  } catch { error("CALCULATION", "Valuation inputs failed calculation validation; run calculate for details."); }
  if (a.review) {
    checkBasis("review", a.review.basis); checkWorker("review", a.review.worker, true);
    if ([a.framework.worker.contextId, a.bull.worker.contextId, a.bear.worker.contextId, a.synthesis.worker.contextId].includes(a.review.worker.contextId)) error("EVALUATOR_ISOLATION", "The evaluator must have a different context from all analysis authors.");
    if (!unique(a.review.dimensions.map(d => d.id))) error("RUBRIC", "Each rubric dimension must be scored exactly once.");
    if (!unique(a.review.findings.map(d => d.id))) error("FINDING_ID", "Finding IDs must be unique.");
    for (const finding of a.review.findings) if (finding.status === "resolved" && !finding.resolutionEvidence.length) error("RESOLUTION", `${finding.id} cannot be resolved without recorded verification evidence.`);
  }
  return { valid: errors.length === 0, errors, warnings, hashes };
}

export function inspectRun(directory: string, requireReview = false): { validation: Validation; artifacts?: Artifacts } {
  const loaded: Record<string, unknown> = {}, errors: Diagnostic[] = [];
  const parsers: Record<string, z.ZodType | null> = { run: RunSchema, evidence: EvidenceSchema, framework: FrameworkSchema, bull: CaseSchema, bear: CaseSchema, valuationInput: ValuationInputSchema, valuation: null, synthesis: SynthesisSchema, review: ReviewSchema };
  for (const [name, file] of Object.entries(FILES)) {
    if (name === "review" && !requireReview && !existsSync(resolve(directory, file))) continue;
    try { const value = readJson(confinedPath(directory, file)); loaded[name] = parsers[name]?.parse(value) ?? value; }
    catch (cause) { errors.push({ code: "ARTIFACT", message: `${file}: ${cause instanceof z.ZodError ? cause.issues.map(i => `${i.path.join(".")}: ${i.message}`).slice(0, 6).join("; ") : cause instanceof Error ? cause.message : "Could not read artifact"}` }); }
  }
  const notes: Record<string, string> = {};
  for (const [key, file] of Object.entries({ workflow: "workflow-record.md", financial: "raw-financial-notes.md", ...(loaded.review ? { audit: "audit-notes.md" } : {}) })) {
    try {
      const path = confinedPath(directory, file);
      if (statSync(path).size > 250_000 || !readFileSync(path, "utf8").trim()) throw new Error("Missing or oversized notes");
      notes[key] = readFileSync(path, "utf8");
    } catch { errors.push({ code: "RESEARCH_NOTES", message: `${file} must record the actual stage checks/provenance in a nonempty file under 250 KB.` }); }
  }
  if (errors.length) return { validation: { valid: false, errors, warnings: [], hashes: {} } };
  loaded.notes = notes;
  const artifacts = loaded as Artifacts, validation = validateArtifacts(artifacts);
  for (const source of artifacts.evidence.sources) if (source.rawFile) {
    try {
      const path = confinedPath(directory, source.rawFile);
      if (statSync(path).size > 50_000_000) throw new Error("Source snapshot exceeds 50 MB.");
      if (byteHash(readFileSync(path)) !== source.rawSha256) throw new Error("Source snapshot hash mismatch.");
    } catch { validation.errors.push({ code: "SOURCE_SNAPSHOT", message: `${source.id}: source snapshot is missing, changed, oversized or outside the run directory.` }); }
  }
  for (const entry of [...(artifacts.review?.dimensions ?? []), ...(artifacts.review?.findings ?? [])]) for (const ref of entry.artifactRefs) {
    try { resolveArtifactReference(directory, ref); }
    catch { validation.errors.push({ code: "AUDIT_REFERENCE", message: `Review reference does not resolve: ${ref}` }); }
  }
  if (existsSync(resolve(directory, "usage.json"))) {
    try { const usage = UsageSchema.parse(readJson(confinedPath(directory, "usage.json"))); validation.hashes.usageHash = artifactHash(usage); }
    catch { validation.errors.push({ code: "USAGE", message: "usage.json does not match the usage schema." }); }
  }
  validation.valid = validation.errors.length === 0;
  return { validation, artifacts };
}
export function resolveArtifactReference(directory: string, ref: string): unknown {
  const [file, pointer, ...extra] = ref.split("#");
  const notes = ["workflow-record.md", "raw-financial-notes.md", "audit-notes.md"];
  if (notes.includes(file) && !pointer && !extra.length) return readFileSync(confinedPath(directory, file), "utf8");
  if (extra.length || !Object.values(FILES).includes(file as typeof FILES[keyof typeof FILES])) throw new Error("Use a named run artifact and optional JSON pointer for JSON files.");
  let value = readJson(confinedPath(directory, file));
  if (pointer) {
    if (!pointer.startsWith("/")) throw new Error("Expected JSON pointer.");
    for (const segment of pointer.slice(1).split("/")) {
      const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
      if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) throw new Error("Pointer does not exist.");
      value = (value as Record<string, unknown>)[key];
    }
  }
  return value;
}
export function scoreReview(review: Review, validation: Validation) {
  const dimensions = RUBRIC.map(item => ({ ...item, score: review.dimensions.find(d => d.id === item.id)?.score ?? 0 }));
  const score = dimensions.reduce((sum, d) => sum + d.weight * d.score / 4, 0);
  const blockers = review.findings.filter(f => f.status === "open" && f.severity !== "minor");
  return {
    version: 1, status: validation.valid && score >= 85 && dimensions.every(d => d.score >= 3) && !blockers.length ? "pass" as const : "needs-revision" as const,
    qualityScore: score, threshold: 85, minimumDimensionScore: 3,
    dimensions, blockers, validation,
    meaning: "Research quality under the fixed rubric; not a probability of investment success. Semantic scores are evaluator judgments. Worker metadata records declared context isolation, not a filesystem security guarantee.",
  };
}
