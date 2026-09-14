import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheExpiration, cacheKey, isCacheValid, researchHash } from "../src/lib/cache";
import { createStore, type Store } from "../src/server/db/store";
import { startAnalysis } from "../src/server/start-analysis";
import { fixture } from "./fixtures";
const stores: Store[] = []; const folders: string[] = [];
const store = () => { const s = createStore(":memory:"); stores.push(s); return s; };
afterEach(() => { stores.splice(0).forEach(s => s.close()); folders.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
describe("cache keys and expiry", () => {
  it("normalizes ticker and uses UTC research day, model, and prompt version", () => {
    expect(cacheKey(" aapl ", "2026-09-06T02:00:00+03:00", "gpt-5.4", "v1")).toBe('["AAPL","2026-09-05","gpt-5.4","v1"]');
    const base = cacheKey("AAPL", "2026-09-06", "m", "v");
    expect(cacheKey("AAPL", "2026-09-07", "m", "v")).not.toBe(base);
    expect(cacheKey("AAPL", "2026-09-06", "other", "v")).not.toBe(base);
    expect(cacheKey("AAPL", "2026-09-06", "m", "new")).not.toBe(base);
  });
  it("expires exactly at the boundary", () => {
    const now = new Date("2026-09-06T10:00:00Z");
    expect(cacheExpiration(now, 24)).toBe("2026-09-07T10:00:00.000Z");
    expect(isCacheValid("2026-09-06T10:00:00.001Z", now)).toBe(true);
    expect(isCacheValid(now.toISOString(), now)).toBe(false);
    expect(isCacheValid("invalid", now)).toBe(false);
  });
  it("hashes the complete frozen packet", () => { const f = fixture(); expect(researchHash(f.research)).toBe(f.saved.researchHash); f.research.businessModel[0].text += "changed"; expect(researchHash(f.research)).not.toBe(f.saved.researchHash); });
});
describe("SQLite cache, history and durable duplicate protection", () => {
  it("returns valid cache without checking a key or scheduling a model call", () => {
    const db = store(), f = fixture(); const reservation = db.reserve("TEST"); db.save(reservation.job.id, f.saved);
    const schedule = vi.fn(), ensureKey = vi.fn();
    const result = startAnalysis("test", false, schedule, { store: db, config: { model: "gpt-5.4", cacheHours: 24 }, ensureKey });
    expect(result.cached).toBe(true); expect(schedule).not.toHaveBeenCalled(); expect(ensureKey).not.toHaveBeenCalled();
    expect(db.list()).toHaveLength(1); expect(db.read(f.saved.id)).toEqual(f.saved);
  });
  it("bypasses cache for refresh and saves a new history entry", () => {
    const db = store(), f = fixture(); db.save(db.reserve("TEST").job.id, f.saved);
    const schedule = vi.fn(); const result = startAnalysis("TEST", true, schedule, { store: db, config: { model: "gpt-5.4", cacheHours: 24 }, ensureKey: () => undefined });
    expect(result.cached).toBe(false); expect(schedule).toHaveBeenCalledOnce();
    if (!result.cached) db.save(result.job.id, fixture().saved);
    expect(db.list()).toHaveLength(2); expect(db.delete(f.saved.id)).toBe(true); expect(db.read(f.saved.id)).toBeNull(); expect(db.list()).toHaveLength(1);
  });
  it("does not return an expired record", () => { const db = store(); const f = fixture(); f.saved.cacheExpiresAt = new Date(Date.now() - 1000).toISOString(); db.save(db.reserve("TEST").job.id, f.saved); expect(db.cache(f.saved.cacheKey)).toBeNull(); });
  it("reuses a valid prior-day packet but isolates models and prompt versions", () => {
    const db = store(); const f = fixture("2026-09-05T22:00:00.000Z"); db.save(db.reserve("TEST").job.id, f.saved);
    const now = new Date("2026-09-06T01:00:00.000Z");
    expect(db.cacheForTicker("TEST", f.saved.model, f.saved.promptVersion, now)?.id).toBe(f.saved.id);
    expect(db.cacheForTicker("TEST", "other", f.saved.promptVersion, now)).toBeNull();
    expect(db.cacheForTicker("TEST", f.saved.model, "other", now)).toBeNull();
  });
  it("joins duplicate starts and refreshes into one job", () => {
    const db = store(); const schedule = vi.fn(); const dependencies = { store: db, config: { model: "gpt-5.4", cacheHours: 24 }, ensureKey: () => undefined };
    const first = startAnalysis("test", false, schedule, dependencies);
    const second = startAnalysis("TEST", true, schedule, dependencies);
    expect(first.cached).toBe(false); expect(second.cached).toBe(false);
    if (!first.cached && !second.cached) { expect(second.duplicate).toBe(true); expect(second.job.id).toBe(first.job.id); }
    expect(schedule).toHaveBeenCalledOnce();
  });
  it("protects the ticker across independent database connections and persists history", () => {
    const dir = mkdtempSync(join(tmpdir(), "thesis-test-")); folders.push(dir);
    const one = createStore(join(dir, "db.sqlite")), two = createStore(join(dir, "db.sqlite")); stores.push(one, two);
    const first = one.reserve("TEST"); expect(two.reserve("TEST").job.id).toBe(first.job.id);
    const f = fixture(); one.save(first.job.id, f.saved); expect(two.read(f.saved.id)).toEqual(f.saved);
  });
  it("releases failed locks and reaps stale jobs", () => {
    const db = store(); const first = db.reserve("TEST"); db.fail(first.job.id, "Test failure");
    expect(db.reserve("TEST").duplicate).toBe(false);
    const old = db.reserve("OLD", new Date(Date.now() - 700_000));
    expect(db.progress(old.job.id)?.status).toBe("failed"); expect(db.reserve("OLD").duplicate).toBe(false);
    expect(() => db.save(old.job.id, fixture().saved)).toThrow(/expired/);
  });
});
