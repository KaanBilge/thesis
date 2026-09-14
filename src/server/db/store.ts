import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { and, desc, eq, gt, lte } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { analyses, jobs } from "./schema";
import { SavedAnalysisSchema, STAGES, type Job, type SavedAnalysis, type Stage, type StageStatus } from "@/lib/schemas";
import { PIPELINE_TIMEOUT_MS } from "../config";
import { AppError } from "../errors";

export function createStore(filename: string, migrationsFolder = join(process.cwd(), "drizzle")) {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder });
  sqlite.pragma("optimize");
  function read(id: string) {
    const row = db.select().from(analyses).where(eq(analyses.id, id)).get();
    if (!row) return null;
    const parsed = SavedAnalysisSchema.safeParse(row.fullAnalysis);
    if (!parsed.success) throw new AppError("CORRUPT_RECORD", "This saved report is incompatible or damaged. Delete it and run a fresh analysis.", 409);
    return parsed.data;
  }
  function cache(key: string, now = new Date()) {
    const rows = db.select().from(analyses).where(and(eq(analyses.cacheKey, key), gt(analyses.cacheExpiresAt, now.toISOString()))).orderBy(desc(analyses.createdAt)).all();
    for (const row of rows) {
      const parsed = SavedAnalysisSchema.safeParse(row.fullAnalysis);
      if (parsed.success) return parsed.data;
    }
    return null;
  }
  function reap(now = new Date()) {
    const expired = db.select().from(jobs).where(and(eq(jobs.status, "running"), lte(jobs.leaseExpiresAt, now.toISOString()))).all();
    for (const row of expired) {
      const payload: Job = { ...row.payload, status: "failed", updatedAt: now.toISOString(), error: "The local research job timed out or the server was restarted. Please start the analysis again." };
      STAGES.forEach(stage => { if (payload.stages[stage] === "running") payload.stages[stage] = "failed"; });
      db.update(jobs).set({ status: "failed", payload }).where(eq(jobs.id, row.id)).run();
    }
  }
  function cacheForTicker(ticker: string, model: string, promptVersion: string, now = new Date()) {
    // The key records the research day, but a still-valid previous-day packet remains reusable.
    const rows = db.select().from(analyses).where(and(eq(analyses.ticker, ticker), eq(analyses.model, model), eq(analyses.promptVersion, promptVersion), gt(analyses.cacheExpiresAt, now.toISOString()))).orderBy(desc(analyses.createdAt)).all();
    for (const row of rows) {
      const parsed = SavedAnalysisSchema.safeParse(row.fullAnalysis);
      if (parsed.success) return parsed.data;
    }
    return null;
  }
  function reserve(ticker: string, now = new Date()) {
    return db.transaction(tx => {
      reap(now);
      const existing = tx.select().from(jobs).where(and(eq(jobs.ticker, ticker), eq(jobs.status, "running"))).get();
      if (existing) return { job: existing.payload, duplicate: true };
      const job: Job = { id: randomUUID(), ticker, status: "running", stages: Object.fromEntries(STAGES.map(stage => [stage, "pending"])) as Job["stages"], createdAt: now.toISOString(), updatedAt: now.toISOString(), analysisId: null, error: null };
      tx.insert(jobs).values({ id: job.id, ticker, status: "running", payload: job, leaseExpiresAt: new Date(now.getTime() + PIPELINE_TIMEOUT_MS + 30_000).toISOString() }).run();
      return { job, duplicate: false };
    }, { behavior: "immediate" });
  }
  function progress(id: string) {
    reap();
    return db.select().from(jobs).where(eq(jobs.id, id)).get()?.payload ?? null;
  }
  function stage(id: string, stage: Stage, status: StageStatus) {
    const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
    if (!row || row.status !== "running") throw new AppError("JOB_EXPIRED", "This research job has expired. Start a fresh analysis.", 409);
    db.update(jobs).set({ payload: { ...row.payload, updatedAt: new Date().toISOString(), stages: { ...row.payload.stages, [stage]: status } } }).where(eq(jobs.id, id)).run();
  }
  function fail(id: string, error: string) {
    const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
    if (!row || row.status !== "running") return;
    const payload: Job = { ...row.payload, status: "failed", error, updatedAt: new Date().toISOString() };
    STAGES.forEach(stage => { if (payload.stages[stage] === "running") payload.stages[stage] = "failed"; });
    db.update(jobs).set({ status: "failed", payload }).where(eq(jobs.id, id)).run();
  }
  function save(jobId: string, analysis: SavedAnalysis) {
    const value = SavedAnalysisSchema.parse(analysis);
    return db.transaction(tx => {
      const row = tx.select().from(jobs).where(eq(jobs.id, jobId)).get();
      if (!row || row.status !== "running" || row.leaseExpiresAt <= new Date().toISOString()) throw new AppError("JOB_EXPIRED", "The analysis expired before it could be saved. Please try again.", 409);
      tx.insert(analyses).values({ ...value, fullAnalysis: value }).run();
      const payload: Job = { ...row.payload, status: "complete", analysisId: value.id, updatedAt: new Date().toISOString(), stages: { ...row.payload.stages, saving: "complete" } };
      tx.update(jobs).set({ status: "complete", payload }).where(eq(jobs.id, jobId)).run();
      return value;
    }, { behavior: "immediate" });
  }
  return { read, cache, cacheForTicker, reserve, progress, stage, fail, save,
    list: () => db.select({ id: analyses.id, ticker: analyses.ticker, companyName: analyses.companyName, verdict: analyses.verdict, overallScore: analyses.overallScore, confidence: analyses.confidence, createdAt: analyses.createdAt, cacheExpiresAt: analyses.cacheExpiresAt }).from(analyses).orderBy(desc(analyses.createdAt)).all(),
    delete: (id: string) => db.delete(analyses).where(eq(analyses.id, id)).run().changes > 0,
    close: () => sqlite.close(),
  };
}
export type Store = ReturnType<typeof createStore>;
const globalDb = globalThis as unknown as { thesisStore?: Store };
export function getStore() {
  return globalDb.thesisStore ??= createStore(process.env.THESIS_DATABASE_PATH ?? join(process.cwd(), "data", "thesis.sqlite"));
}
