import { readFile, readdir, realpath } from "node:fs/promises";
import { resolve, join, relative, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import type { WorkflowSnapshot, WorkflowEvent } from "../lib/workflow";
import { redact } from "../analyst/telemetry";
import { AppError } from "./errors";

const storage = () => resolve(process.cwd(), "data", "workflows");
function safeId(id: string) { if (!/^[A-Za-z0-9._-]+$/.test(id) || id === "." || id === "..") throw new AppError("WORKFLOW_ID", "Invalid workflow identifier.", 400); return id; }
export async function workflow(id: string): Promise<WorkflowSnapshot> {
  try { return JSON.parse(await readFile(join(storage(), safeId(id), "snapshot.json"), "utf8")); }
  catch (error) { if (error instanceof AppError) throw error; throw new AppError("NOT_FOUND", "Workflow not found. Import its session logs first.", 404); }
}
export async function workflows() {
  let entries; try { entries = await readdir(storage(), { withFileTypes: true }); } catch { return []; }
  const snapshots = await Promise.all(entries.filter(e => e.isDirectory() && !e.isSymbolicLink()).map(e => workflow(e.name).catch(() => null)));
  return snapshots.filter((s): s is WorkflowSnapshot => s !== null).map(s => ({ id: s.id, ticker: s.ticker, company: s.company, asOf: s.asOf, agentCount: s.agents.length })).sort((a,b) => b.asOf.localeCompare(a.asOf));
}
export async function workflowEvents(id: string, agentId: string): Promise<WorkflowEvent[]> {
  const snapshot = await workflow(id);
  if (!snapshot.agents.some(a => a.id === agentId)) throw new AppError("NOT_FOUND", "Agent not found in this run.", 404);
  return JSON.parse(await readFile(join(storage(), safeId(id), `${safeId(agentId)}.json`), "utf8"));
}
export async function workflowArtifact(id: string, path: string) {
  const snapshot = await workflow(id); const artifact = snapshot.artifacts.find(a => a.path === path);
  if (!artifact) throw new AppError("NOT_FOUND", "Artifact is not part of this run.", 404);
  if (!artifact.readable) throw new AppError("ARTIFACT_TYPE", "Preview is available for text artifacts up to 3 MB.", 400);
  const source = JSON.parse(await readFile(join(storage(), safeId(id), "source.json"), "utf8"));
  const root = await realpath(source.runDir); const file = await realpath(resolve(root, path)); const rel = relative(root, file);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new AppError("ARTIFACT_PATH", "Artifact path is outside this run.", 403);
  const bytes = await readFile(file);
  if (bytes.length > 3_000_000) throw new AppError("ARTIFACT_SIZE", "Artifact is too large to preview.", 400);
  const hash = createHash("sha256").update(bytes).digest("hex");
  return { path, text: redact(bytes.toString("utf8")), hash, matchesSnapshot: hash === artifact.hash };
}
