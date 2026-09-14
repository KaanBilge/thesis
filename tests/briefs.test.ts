import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createBriefStore } from "../src/server/briefs";
import { BriefInputSchema } from "../src/lib/briefs";
import { loadBriefDirectory } from "../src/lib/brief-files";

const sample = { ticker: "aapl", companyName: "Example fixture", asOf: "2026-09-14T15:00:00+03:00", model: "test-fixture", report: "# Report\r\n\r\n[Source](https://example.com/filing)\n\n| Metric | Value |\n| --- | --- |\n| Test | 1 |", researchRecord: "# Research record\nFictional test evidence; not investment research." };
const folders: string[] = [];
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "thesis-import-test-")); folders.push(root);
  const folder = join(root, "reports", "AAPL", "20260914T120000Z"); mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "report.md"), sample.report); writeFileSync(join(folder, "research-record.md"), sample.researchRecord);
  return { root, folder };
}
describe("Codex brief handoff", () => {
  it("preserves exact documents, deduplicates normalized inputs, and versions changed evidence", () => {
    const store = createBriefStore(":memory:");
    try {
      const first = store.save(sample);
      const again = store.save({ ...sample, ticker: "AAPL", asOf: "2026-09-14T12:00:00Z" });
      expect(again.duplicate).toBe(true); expect(again.brief.id).toBe(first.brief.id);
      expect(store.read(first.brief.id)?.report).toBe(sample.report);
      expect(store.read(first.brief.id)?.researchRecord).toBe(sample.researchRecord);
      expect(store.save({ ...sample, researchRecord: sample.researchRecord + "\nMore evidence" }).duplicate).toBe(false);
      expect(store.list()).toHaveLength(2); expect(store.list()[0]).not.toHaveProperty("report");
      expect(store.list()[0]).not.toHaveProperty("overallScore");
      expect(store.delete(first.brief.id)).toBe(true); expect(store.read(first.brief.id)).toBe(null);
    } finally { store.close(); }
  });
  it("rejects incomplete documents, invented fields and invalid timestamps before saving", () => {
    for (const change of [{ report: " " }, { researchRecord: "" }, { asOf: "2026-09-14" }, { ticker: "../BAD" }, { score: 95 }, { report: "x".repeat(1_000_001) }]) expect(BriefInputSchema.safeParse({ ...sample, ...change }).success).toBe(false);
  });
  it("reads the skill's folder convention without inferring model or company identity", () => {
    const { folder } = fixture(); const result = loadBriefDirectory(folder);
    expect(result.ticker).toBe("AAPL"); expect(result.asOf).toBe("2026-09-14T12:00:00.000Z");
    expect(result.model).toBe("Not recorded"); expect(result.companyName).toBe("AAPL");
    expect(result.report).toBe(sample.report);
    expect(() => loadBriefDirectory(join(folder, "missing"))).toThrow();
    writeFileSync(join(folder, "research-record.md"), "x".repeat(1_000_001));
    expect(() => loadBriefDirectory(folder)).toThrow("under 1 MB");
  });
  it("imports offline from another working directory and persists across process restarts", () => {
    const { root, folder } = fixture(); const database = join(root, "test.sqlite");
    const invoke = (extra: string[] = []) => spawnSync(process.execPath, [join(process.cwd(), "node_modules/tsx/dist/cli.mjs"), join(process.cwd(), "scripts/import-brief.ts"), "--dir", folder, ...extra], { cwd: root, encoding: "utf8", env: { ...process.env, THESIS_DATABASE_PATH: database, OPENAI_API_KEY: "" } });
    const check = invoke(["--check"]); expect(check.status, check.stderr).toBe(0); expect(JSON.parse(check.stdout).valid).toBe(true);
    const first = invoke(); expect(first.status, first.stderr).toBe(0);
    const second = invoke(); expect(second.status, second.stderr).toBe(0);
    expect(JSON.parse(first.stdout).id).toBe(JSON.parse(second.stdout).id);
    expect(JSON.parse(second.stdout).status).toBe("already-saved");
    expect(invoke(["--as-of", "invalid"]).status).toBe(1);
  });
});
