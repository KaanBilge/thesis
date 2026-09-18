import { readFileSync, readdirSync, mkdirSync, writeFileSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { resolve, join, relative, basename, extname } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { parseRollout, redact } from "../src/analyst/telemetry";
import type { WorkflowSnapshot } from "../src/lib/workflow";

const { values } = parseArgs({ options: { run: { type: "string" }, thread: { type: "string" }, sessions: { type: "string" }, "research-end": { type: "string" } } });
if (!values.run || !values.thread) throw new Error("Usage: npm run workflow:import -- --run reports/TICKER/TIMESTAMP --thread ROOT_THREAD_ID [--sessions DIRECTORY] [--research-end ISO_DATE]");
const runDir = resolve(values.run);
const sessionsDir = resolve(values.sessions ?? join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions"));
const readJson = (name: string) => JSON.parse(readFileSync(join(runDir, name), "utf8"));
const optionalJson = (name: string) => { try { return readJson(name); } catch { return null; } };
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isSymbolicLink() ? [] : entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]);
}
// Read metadata only before selecting the requested session family. Unrelated
// task bodies are not read or copied into Thesis.
function metadata(file: string) {
  const fd = openSync(file, "r"); const buffer = Buffer.alloc(32768);
  try { const length = readSync(fd, buffer, 0, buffer.length, 0); return JSON.parse(buffer.subarray(0, length).toString("utf8").split("\n")[0]).payload; }
  catch { return null; } finally { closeSync(fd); }
}
const candidates = files(sessionsDir).filter(f => f.endsWith(".jsonl")).map(file => ({ file, meta: metadata(file) }));
const selected = new Set([values.thread]);
let changed = true;
while (changed) { changed = false; for (const c of candidates) if (c.meta && (c.meta.session_id === values.thread || selected.has(c.meta.parent_thread_id)) && !selected.has(c.meta.id)) { selected.add(c.meta.id); changed = true; } }
const parsed = candidates.filter(c => selected.has(c.meta?.id)).map(c => parseRollout(readFileSync(c.file, "utf8"), relative(sessionsDir, c.file).replaceAll("\\", "/")));
if (!parsed.some(p => p.agent.id === values.thread)) throw new Error("Root session log not found. No export was written.");
if (new Set(parsed.map(p => p.agent.id)).size !== parsed.length) throw new Error("Multiple logs for one agent; consolidate the logs before importing to avoid duplicate usage.");
const run = readJson("run.json"); const evidence = optionalJson("evidence.json");
const dispatches = optionalJson("dispatch-log.json")?.dispatches ?? [];
const agents = parsed.map(p => p.agent).sort((a,b) => a.startedAt.localeCompare(b.startedAt));
for (const agent of agents) {
  const dispatch = dispatches.find((d: { task_name: string }) => d.task_name === agent.role);
  agent.inputs = dispatch?.allowedInputs ?? (agent.parentId ? [] : ["User request", "Generator and evaluator skills", "Worker handoffs", "Research artifacts"]);
  agent.outputs = dispatch?.allowedOutputs ?? (agent.parentId ? [] : ["workflow-record.md", "dispatch-log.json", "report.md", "research-record.md"]);
  agent.restrictions = dispatch?.forbiddenInputs ?? [];
}
const root = agents.find(a => a.id === values.thread)!;
const firstSuccess = root.turns.find(t => t.status === "completed" && t.result);
const researchEndedAt = values["research-end"] ? new Date(values["research-end"]).toISOString() : firstSuccess?.endedAt ?? null;
const audit = optionalJson("audit-result.json"), review = optionalJson("review.json"), valuation = optionalJson("valuation.json"), synthesis = optionalJson("synthesis.json");
const artifacts = files(runDir).map(file => {
  const bytes = statSync(file).size; const path = relative(runDir, file).replaceAll("\\", "/");
  return { path, bytes, hash: createHash("sha256").update(readFileSync(file)).digest("hex"), readable: bytes <= 3_000_000 && [".md", ".json", ".txt", ".cjs", ".html", ".csv"].includes(extname(file).toLowerCase()) };
}).sort((a,b) => a.path.localeCompare(b.path));
const id = `${run.ticker}-${basename(runDir)}`;
if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error("Invalid run identifier");
const snapshot: WorkflowSnapshot = {
  version: 1, id, ticker: run.ticker, company: evidence?.companyName ?? run.ticker, asOf: run.asOf, rootThreadId: values.thread,
  capturedAt: new Date().toISOString(), startedAt: root.startedAt, endedAt: agents.map(a => a.endedAt).sort().at(-1)!, researchEndedAt,
  researchBoundary: values["research-end"] ? "Explicit import cutoff" : "First successfully completed coordinator turn; later turns are follow-ups. Review against the turn ledger.", agents, artifacts,
  audit: audit ? { score: audit.qualityScore, status: audit.status, dimensions: audit.dimensions, findings: review?.findings ?? [] } : null,
  result: synthesis ? { conclusion: synthesis.conclusion, summary: synthesis.summary.text, marketPrice: valuation?.marketPrice ?? null, scenarios: (valuation?.scenarios ?? []).map((s: { name: string; fairValue: { perShareValue?: number }; horizonValue: { perShareValue?: number }; returns?: { totalReturn?: number }; entry?: { entryCeiling?: number } }) => ({ name: s.name, fairValue: s.fairValue?.perShareValue ?? null, horizonValue: s.horizonValue?.perShareValue ?? null, totalReturn: s.returns?.totalReturn ?? null, entry: s.entry?.entryCeiling ?? null })) } : null,
  evidence: evidence ? { claims: evidence.claims.length, sources: evidence.sources.length, coverage: evidence.coverage.map((c: { area: string; status: string; limitations?: string[] }) => ({ area: c.area, status: c.status, notes: (c.limitations ?? []).join(" ") })) } : null,
  notes: [
    "Measured local telemetry, not a billing invoice. Input counts include cached input; output counts include reasoning tokens. Do not add these subsets again.",
    "Totals sum unique response records per agent, not cumulative snapshots across events. Repeated context is counted on each model request. Root and child records are separate.",
    "Subscription allowance percentages are account-wide. This export cannot convert tokens into five-hour allowances or dollar cost, or attribute other account activity to this run.",
    "Exact handoff text is encrypted in these logs. Dispatch-log input/output boundaries and accessible public messages are preserved; no reconstructed prompt is presented as verbatim.",
    "Shows public messages, tool calls and outputs, commands, saved results, and numerical usage. Private reasoning and system/developer instructions are excluded.",
    "Audit scores and financial conclusions are the original run's saved results, not a new financial audit. Original research files are unchanged.",
  ],
};
const outputDir = resolve("data", "workflows", id); mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, "snapshot.json"), JSON.stringify(snapshot, null, 2) + "\n");
writeFileSync(join(outputDir, "source.json"), JSON.stringify({ runDir }) + "\n");
for (const { agent, events } of parsed) writeFileSync(join(outputDir, `${agent.id}.json`), JSON.stringify(events) + "\n");
const summary = { id, researchEndedAt, agents: agents.length, researchTokens: agents.flatMap(a => a.requests).filter(r => !researchEndedAt || r.at <= researchEndedAt).reduce((n,r) => n+r.total,0), sessionTokens: agents.reduce((n,a) => n+(a.usage?.total ?? 0),0), path: `/workflows?run=${id}` };
writeFileSync(join(outputDir, "receipt.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(redact(JSON.stringify(summary)));
