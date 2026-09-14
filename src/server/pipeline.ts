import "server-only";
import { randomUUID } from "node:crypto";
import { cacheKey, cacheExpiration, researchHash } from "@/lib/cache";
import { finalizeDecision } from "@/lib/scoring";
import { SavedAnalysisSchema, type Job, type Stage } from "@/lib/schemas";
import { createAIContext } from "./ai/structured";
import { research } from "./ai/research";
import { planMethodology } from "./ai/methodology";
import { buildBullCase } from "./ai/bull";
import { buildBearCase } from "./ai/bear";
import { adjudicate } from "./ai/orchestrator";
import { PROMPT_VERSION, PROMPT_VERSIONS } from "./ai/prompts";
import { PIPELINE_TIMEOUT_MS } from "./config";
import { safeError } from "./errors";
import type { Store } from "./db/store";
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}
export async function runPipeline(job: Job, config: { model: string; cacheHours: number }, store: Store) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("Research deadline reached", "TimeoutError")), PIPELINE_TIMEOUT_MS);
  const stage = async <T>(name: Stage, work: () => Promise<T>) => {
    controller.signal.throwIfAborted(); store.stage(job.id, name, "running");
    const result = await work();
    controller.signal.throwIfAborted(); store.stage(job.id, name, "complete");
    return freeze(result);
  };
  try {
    const context = createAIContext(config.model, controller.signal);
    const packet = await stage("research", () => research(context, job.ticker, new Date().toISOString()));
    const methodology = await stage("methodology", () => planMethodology(context, packet));
    const [bullCase, bearCase] = await Promise.all([
      stage("bull", () => buildBullCase(context, packet, methodology)),
      stage("bear", () => buildBearCase(context, packet, methodology)),
    ]);
    const assessment = await stage("orchestrator", () => adjudicate(context, packet, methodology, bullCase, bearCase));
    const decision = finalizeDecision(methodology, assessment, bullCase, bearCase);
    const now = new Date();
    store.stage(job.id, "saving", "running");
    const saved = SavedAnalysisSchema.parse({
      id: randomUUID(), ticker: packet.ticker, companyName: packet.companyName,
      verdict: decision.verdict, overallScore: decision.overallScore, confidence: decision.confidence,
      research: packet, methodology, bullCase, bearCase, decision,
      researchTimestamp: packet.asOf, createdAt: now.toISOString(), model: config.model,
      promptVersion: PROMPT_VERSION, promptVersions: PROMPT_VERSIONS, researchHash: researchHash(packet),
      cacheKey: cacheKey(job.ticker, packet.asOf, config.model, PROMPT_VERSION),
      cacheExpiresAt: cacheExpiration(new Date(packet.asOf), config.cacheHours),
    });
    controller.signal.throwIfAborted();
    store.save(job.id, saved);
  } catch (error) {
    // Abort the other concurrent analyst if one fails; release the durable ticker lock.
    controller.abort();
    store.fail(job.id, safeError(error).message);
  } finally { clearTimeout(timeout); }
}
