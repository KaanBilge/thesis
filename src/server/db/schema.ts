import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import type { SavedAnalysis, Job } from "@/lib/schemas";
import type { BriefInput } from "@/lib/briefs";
export const briefs = sqliteTable("briefs", {
  id: text("id").primaryKey(),
  ticker: text("ticker").notNull(),
  companyName: text("company_name").notNull(),
  kind: text("kind", { enum: ["stock-brief", "thesis"] }).notNull(),
  asOf: text("as_of").notNull(),
  model: text("model").notNull(),
  contentHash: text("content_hash").notNull(),
  importedAt: text("imported_at").notNull(),
  payload: text("payload", { mode: "json" }).$type<BriefInput>().notNull(),
}, table => [uniqueIndex("idx_briefs_content").on(table.contentHash), index("idx_briefs_asof").on(table.asOf)]);
export const analyses = sqliteTable("analyses", {
  id: text("id").primaryKey(), ticker: text("ticker").notNull(), companyName: text("company_name").notNull(),
  verdict: text("verdict", { enum: ["Bullish", "Neutral", "Bearish"] }).notNull(),
  overallScore: integer("overall_score").notNull(), confidence: integer("confidence").notNull(),
  fullAnalysis: text("full_analysis", { mode: "json" }).$type<SavedAnalysis>().notNull(),
  researchTimestamp: text("research_timestamp").notNull(), createdAt: text("created_at").notNull(),
  model: text("model").notNull(), promptVersion: text("prompt_version").notNull(), researchHash: text("research_hash").notNull(),
  cacheKey: text("cache_key").notNull(), cacheExpiresAt: text("cache_expires_at").notNull(),
}, table => [index("idx_analyses_cache").on(table.cacheKey, table.createdAt), index("idx_analyses_created").on(table.createdAt), index("idx_analyses_identity").on(table.ticker, table.model, table.promptVersion, table.cacheExpiresAt)]);
export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(), ticker: text("ticker").notNull(),
  status: text("status", { enum: ["running", "complete", "failed"] }).notNull(),
  payload: text("payload", { mode: "json" }).$type<Job>().notNull(),
  leaseExpiresAt: text("lease_expires_at").notNull(),
}, table => [uniqueIndex("idx_jobs_active_ticker").on(table.ticker).where(sql`${table.status} = 'running'`)]);
