import "server-only";
import { TickerSchema, type StartResponse, type Job } from "@/lib/schemas";
import { PROMPT_VERSION } from "./ai/prompts";
import { getConfig, requireApiKey } from "./config";
import { getStore, type Store } from "./db/store";
import { runPipeline } from "./pipeline";
export type Scheduler = (work: () => Promise<void>) => void;
// Dependency injection permits exercising cache and duplicate protection without API calls.
export function startAnalysis(rawTicker: string, refresh: boolean, schedule: Scheduler, dependencies: {
  store?: Store; config?: { model: string; cacheHours: number }; ensureKey?: () => unknown;
  run?: (job: Job, config: { model: string; cacheHours: number }, store: Store) => Promise<void>;
} = {}): StartResponse {
  const ticker = TickerSchema.parse(rawTicker);
  const config = dependencies.config ?? getConfig();
  const store = dependencies.store ?? getStore();
  if (!refresh) {
    const cached = store.cacheForTicker(ticker, config.model, PROMPT_VERSION);
    if (cached) return { cached: true, analysis: cached };
  }
  (dependencies.ensureKey ?? requireApiKey)();
  const reservation = store.reserve(ticker);
  if (!reservation.duplicate) {
    try { schedule(() => (dependencies.run ?? runPipeline)(reservation.job, config, store)); }
    catch (e) { store.fail(reservation.job.id, "The research job could not start. Please try again."); throw e; }
  }
  return { cached: false, ...reservation };
}
