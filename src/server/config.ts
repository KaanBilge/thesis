import "server-only";
import { z } from "zod";
import { AppError } from "./errors";
const ConfigSchema = z.object({
  OPENAI_MODEL: z.string().trim().min(1).max(100).default("gpt-5.4"),
  ANALYSIS_CACHE_HOURS: z.coerce.number().positive().max(8760).default(24),
});
export function getConfig() {
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) throw new AppError("CONFIG", "Check OPENAI_MODEL and ANALYSIS_CACHE_HOURS in .env.local, then restart the server.", 503);
  return { model: parsed.data.OPENAI_MODEL, cacheHours: parsed.data.ANALYSIS_CACHE_HOURS };
}
export function requireApiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new AppError("NO_KEY", "Add OPENAI_API_KEY to this app’s .env.local file and restart the local server. Your key must not be entered in the browser.", 503);
  return key;
}
export const PIPELINE_TIMEOUT_MS = 10 * 60_000;
export const REQUEST_TIMEOUT_MS = 120_000;
