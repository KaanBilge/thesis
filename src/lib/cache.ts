import { createHash } from "node:crypto";
import { TickerSchema } from "./schemas";
export function cacheKey(ticker: string, date: string | Date, model: string, version: string) {
  const day = new Date(date).toISOString().slice(0, 10);
  return JSON.stringify([TickerSchema.parse(ticker), day, model, version]);
}
export function cacheExpiration(now: Date, hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) throw new Error("Cache hours must be positive.");
  return new Date(now.getTime() + hours * 3_600_000).toISOString();
}
export function isCacheValid(expiresAt: string, now = new Date()) {
  return Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) > now.getTime();
}
export function researchHash(research: unknown) {
  return createHash("sha256").update(JSON.stringify(research)).digest("hex");
}
