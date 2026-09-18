import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { artifactSchemas, RunSchema, BASELINE_MODEL, RUBRIC } from "../src/analyst/contracts";
import { artifactHash, byteHash, readJson, writeJson, inspectRun, scoreReview } from "../src/analyst/artifacts";
import { collectResearch } from "../src/analyst/retrieval";
import { calculateValuation, ValuationInputSchema, PriceHistoryInputSchema, priceHistoryMetrics, ReversePeInputSchema, reversePe } from "../src/analyst/calculations";
import { renderRun, renderIncompleteRun } from "../src/analyst/render";
import { deriveFinancialPeriod, PeriodInputSchema } from "../src/analyst/periods";

const help = `Thesis analyst tools (no model API calls)
  init --ticker AAPL --out reports/AAPL/YYYYMMDDTHHMMSSZ [--as-of ISO] [--horizon 12]
  collect --ticker AAPL --out <run-directory> [--as-of ISO]
  calculate --input <valuation-input.json> --out <valuation.json>
  prices --input <price-history-input.json> --out <price-metrics.json>
  reverse-pe --input <reverse-pe-input.json> --out <reverse-pe.json>
  periods --input <financial-periods.json> --out <derived-period.json>
  hash --input <artifact.json> [--raw for exact bytes of Markdown notes]
  schema --name run|evidence|framework|case|synthesis|review|usage|incomplete|valuation-input|price-history|reverse-pe|periods
  validate --run <directory>
  audit --run <directory>
  render --run <directory>
  draft --run <directory> --input <incomplete.json>
  doctor
  rubric
Collect loads .env.local (when present): SEC_USER_AGENT, FRED_API_KEY, MASSIVE_API_KEY.
Missing credentials produce explicit collection gaps. Analysts must supplement filings with verified news/earnings/industry evidence.
Schema-valid artifacts are not proof of factual correctness. The independent evaluator must inspect sources and financial judgments.
`;
async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    ticker: { type: "string" }, out: { type: "string" }, input: { type: "string" }, run: { type: "string" },
    name: { type: "string" }, "as-of": { type: "string" }, horizon: { type: "string" }, help: { type: "boolean" },
    raw: { type: "boolean" },
  } });
  const command = positionals[0];
  if (values.help || !command) { console.log(help); return; }
  if (positionals.length !== 1) throw new Error("Supply exactly one command. Use --help for usage.");
  const required = (name: "ticker" | "out" | "input" | "run" | "name") => { const value = values[name]; if (!value) throw new Error(`Provide --${name}.`); return value; };
  const emit = (value: unknown) => console.log(JSON.stringify(value));
  if (command === "schema") {
    const name = required("name");
    const schema = name === "valuation-input" ? ValuationInputSchema : name === "price-history" ? PriceHistoryInputSchema : name === "reverse-pe" ? ReversePeInputSchema : name === "periods" ? PeriodInputSchema : artifactSchemas[name as keyof typeof artifactSchemas];
    if (!schema) throw new Error("Unknown schema name. Use --help.");
    emit(z.toJSONSchema(schema)); return;
  }
  if (command === "rubric") { emit({ threshold: 85, minimumDimension: 3, scale: "0–4", dimensions: RUBRIC, blocking: "Any validation failure or open major/critical finding" }); return; }
  if (command === "init") {
    const directory = resolve(required("out"));
    const run = RunSchema.parse({ version: 1, ticker: required("ticker").trim().toUpperCase(), asOf: values["as-of"] ?? new Date().toISOString(), horizonMonths: Number(values.horizon ?? 12), modelPolicy: "astra-quality-baseline" });
    mkdirSync(directory, { recursive: true });
    const path = join(directory, "run.json");
    if (existsSync(path)) throw new Error("This run is already initialized. Use a new directory to preserve the research cutoff.");
    writeJson(path, run); emit({ status: "initialized", path, run }); return;
  }
  if (command === "collect" || command === "doctor") {
    if (existsSync(".env.local")) process.loadEnvFile(".env.local");
    if (command === "doctor") { emit({ node: process.version, baselineModel: BASELINE_MODEL, reasoning: "high or greater", credentials: Object.fromEntries(["SEC_USER_AGENT", "FRED_API_KEY", "MASSIVE_API_KEY"].map(key => [key, !!process.env[key]?.trim()])), modelApiRequired: false, availableSchemas: [...Object.keys(artifactSchemas), "valuation-input", "price-history", "reverse-pe", "periods"] }); return; }
    const directory = resolve(required("out")), ticker = required("ticker").trim().toUpperCase();
    const runPath = join(directory, "run.json"), run = existsSync(runPath) ? RunSchema.parse(readJson(runPath)) : null;
    if (run && (run.ticker !== ticker || (values["as-of"] && Date.parse(values["as-of"]) !== Date.parse(run.asOf)))) throw new Error("Collection ticker/cutoff must match run.json. Start a new run for another cutoff.");
    const packet = await collectResearch({ ticker, outDir: directory, asOf: run?.asOf ?? values["as-of"] });
    emit({ status: Object.values(packet.components).every(c => c.status === "complete") ? "collected" : "incomplete", packet: join(directory, "retrieval-packet.json"), components: packet.components, warnings: packet.warnings }); return;
  }
  if (command === "calculate") { const result = calculateValuation(readJson(required("input"))); writeJson(resolve(required("out")), result); emit({ status: "calculated", path: resolve(required("out")), hash: artifactHash(result) }); return; }
  if (command === "prices" || command === "reverse-pe") { const result = (command === "prices" ? priceHistoryMetrics : reversePe)(readJson(required("input"))); writeJson(resolve(required("out")), result); emit({ status: "calculated", path: resolve(required("out")), hash: artifactHash(result) }); return; }
  if (command === "periods") { const result = deriveFinancialPeriod(readJson(required("input"))); writeJson(resolve(required("out")), result); emit({ status: "calculated", path: resolve(required("out")), hash: artifactHash(result) }); return; }
  if (command === "hash") { emit({ hash: values.raw ? byteHash(readFileSync(required("input"))) : artifactHash(readJson(required("input"))) }); return; }
  if (command === "validate" || command === "audit") {
    const { artifacts, validation } = inspectRun(resolve(required("run")), command === "audit");
    if (command === "audit" && artifacts?.review) {
      const result = scoreReview(artifacts.review, validation); writeJson(join(resolve(required("run")), "audit-result.json"), result); emit(result); if (result.status !== "pass") process.exitCode = 1;
    } else { emit(validation); if (!validation.valid) process.exitCode = 1; }
    return;
  }
  if (command === "render") { const result = renderRun(resolve(required("run"))); emit(result); if (result.status !== "pass") process.exitCode = 1; return; }
  if (command === "draft") { emit(renderIncompleteRun(resolve(required("run")), readJson(required("input")))); return; }
  throw new Error("Unknown command. Use --help for supported tools.");
}
main().catch(error => {
  // Provider failures are already sanitized by retrieval; parser errors should not dump inputs.
  const message = error instanceof z.ZodError ? error.issues.map(i => `${i.path.join(".")}: ${i.message}`).slice(0, 12).join("; ") : error instanceof Error ? error.message : "Analyst command failed.";
  console.error(JSON.stringify({ error: message })); process.exitCode = 1;
});
