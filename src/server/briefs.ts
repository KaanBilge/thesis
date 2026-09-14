// Node-only shared storage for the local CLI and route handlers. No model calls.
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { desc, eq } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { BriefInputSchema, type Brief, type BriefSummary } from "../lib/briefs";
import { briefs } from "./db/schema";

export function createBriefStore(filename: string, migrationsFolder = join(process.cwd(), "drizzle")) {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder });
  function read(id: string): Brief | null {
    const row = db.select().from(briefs).where(eq(briefs.id, id)).get();
    return row ? { ...BriefInputSchema.parse(row.payload), id: row.id, contentHash: row.contentHash, importedAt: row.importedAt } : null;
  }
  function save(input: unknown) {
    const payload = BriefInputSchema.parse(input);
    const contentHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    // The unique index plus INSERT ON CONFLICT makes simultaneous CLI imports safe.
    const result = db.insert(briefs).values({ ...payload, id: randomUUID(), contentHash, importedAt: new Date().toISOString(), payload }).onConflictDoNothing({ target: briefs.contentHash }).run();
    const row = db.select().from(briefs).where(eq(briefs.contentHash, contentHash)).get()!;
    return { brief: read(row.id)!, duplicate: result.changes === 0 };
  }
  return {
    save, read,
    list: (): BriefSummary[] => db.select({ id: briefs.id, ticker: briefs.ticker, companyName: briefs.companyName, kind: briefs.kind, asOf: briefs.asOf, model: briefs.model, contentHash: briefs.contentHash, importedAt: briefs.importedAt }).from(briefs).orderBy(desc(briefs.asOf), desc(briefs.importedAt)).all(),
    delete: (id: string) => db.delete(briefs).where(eq(briefs.id, id)).run().changes > 0,
    close: () => sqlite.close(),
  };
}
const state = globalThis as unknown as { thesisBriefStore?: ReturnType<typeof createBriefStore> };
export function getBriefStore() {
  return state.thesisBriefStore ??= createBriefStore(process.env.THESIS_DATABASE_PATH ?? join(process.cwd(), "data", "thesis.sqlite"));
}
