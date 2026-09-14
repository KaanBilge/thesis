// Run against an isolated Thesis database, never a personal research library.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { get as httpGet } from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
if (!process.env.THESIS_TEST_URL) throw new Error("Set THESIS_TEST_URL to an isolated local test server.");
const base = new URL(process.env.THESIS_TEST_URL);
assert(["127.0.0.1", "localhost"].includes(base.hostname));
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
const page = await context.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
const ids = new Set();
const headers = { "Content-Type": "application/json" };
const request = (path, options) => fetch(new URL(path, base), options);
const marker = `QA fixture ${randomUUID()}`;
const payload = { version: 1, ticker: "ZQA", companyName: marker, asOf: "2026-09-14T12:00:00Z", model: "test-fixture", kind: "stock-brief", report: '# Test report\n\n## Evidence\n\nFictional browser fixture. [Source](https://example.com/filing).\n\n| Input | Value |\n| --- | --- |\n| Fixture | 1 |\n\n<script>window.__unsafe=true</script>\n\n![tracking](https://example.com/tracker.png)\n\n[Unsafe](javascript:alert(1))', researchRecord: "# Research record\n\n## Method\n\nFictional test provenance." };
try {
  await page.goto(base.href); await page.waitForLoadState("networkidle");
  assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "Research library");
  const first = await request("/api/briefs", { method: "POST", headers, body: JSON.stringify(payload) });
  assert.equal(first.status, 201); const saved = await first.json(); ids.add(saved.brief.id);
  const repeat = await request("/api/briefs", { method: "POST", headers, body: JSON.stringify(payload) });
  assert.equal(repeat.status, 200); assert.equal((await repeat.json()).brief.id, saved.brief.id);
  const list = await (await request("/api/briefs")).json();
  assert(!("report" in list.items[0]));
  // External CLI/API imports become visible without reloading the page.
  await page.getByRole("table").getByRole("button").filter({ hasText: marker }).waitFor({ timeout: 12000 });
  await page.getByRole("textbox", { name: "Search research" }).fill("no-match-fixture");
  await page.getByRole("heading", { name: "No matching research" }).waitFor();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("table").getByRole("button").filter({ hasText: marker }).click();
  await page.getByRole("tabpanel").waitFor();
  assert(page.url().includes(saved.brief.id));
  assert.equal(await page.locator(".markdown-document table").count(), 1);
  assert.equal(await page.locator(".markdown-document img,.markdown-document script").count(), 0);
  assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
  assert.equal(await page.evaluate(() => window.__unsafe), undefined);
  await page.getByRole("tab", { name: "Research record", exact: true }).click();
  await page.getByRole("heading", { name: "Method", exact: true }).waitFor();
  await page.getByRole("tab", { name: "Research record", exact: true }).press("ArrowLeft");
  assert.equal(await page.getByRole("tab", { name: "Report", exact: true }).getAttribute("aria-selected"), "true");
  const downloadPromise = page.waitForEvent("download"); await page.getByRole("button", { name: "Markdown", exact: true }).click();
  assert.equal((await downloadPromise).suggestedFilename(), "ZQA-report.md");
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  assert((await page.evaluate(() => navigator.clipboard.readText())).includes(saved.brief.id));
  await page.reload(); await page.getByRole("tabpanel").waitFor();
  await page.getByRole("button", { name: "Research library", exact: true }).click();
  await page.getByRole("button", { name: "Codex handoff", exact: true }).click();
  await page.getByRole("textbox", { name: "Stock ticker", exact: true }).fill("ZQB");
  await page.getByRole("button", { name: "Copy Codex prompt" }).click();
  assert((await page.evaluate(() => navigator.clipboard.readText())).includes("research ZQB"));
  await page.getByRole("button", { name: "Import existing files" }).click();
  await page.getByLabel("Company name", { exact: true }).fill(marker + " manual");
  await page.getByLabel("Research cutoff (your local time)").fill("2026-09-14T15:00");
  await page.getByLabel("Report and research record", { exact: true }).setInputFiles([
    { name: "report.md", mimeType: "text/markdown", buffer: Buffer.from(payload.report) },
    { name: "research-record.md", mimeType: "text/markdown", buffer: Buffer.from(payload.researchRecord) },
  ]);
  const imported = page.waitForResponse(r => r.url().endsWith("/api/briefs") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Save to library" }).click();
  const response = await imported; assert.equal(response.status(), 201); const manual = await response.json(); ids.add(manual.brief.id);
  await page.getByRole("tabpanel").waitFor();
  assert.equal(manual.brief.report, payload.report); assert.equal(manual.brief.researchRecord, payload.researchRecord);
  assert.equal(manual.brief.model, "Not recorded");
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Reader overflow at ${width}`);
  }
  await page.getByRole("button", { name: "Research library", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "New analysis", exact: true }).click();
  await page.getByRole("heading", { name: "New analysis", exact: true }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: /^Research library \d/ }).click();
  await page.getByRole("button", { name: "Delete ZQB stock brief", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Delete ZQB stock brief", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.locator(".delete-notice").waitFor({ state: "hidden" });
  assert.equal((await request(`/api/briefs/${manual.brief.id}`)).status, 404); ids.delete(manual.brief.id);
  for (const [body, expected] of [[{ ...payload, report: "" }, 400], [{ ...payload, asOf: "not-a-date" }, 400], [{ ...payload, report: "x".repeat(2_100_001) }, 413]]) {
    assert.equal((await request("/api/briefs", { method: "POST", headers, body: JSON.stringify(body) })).status, expected);
  }
  assert.equal((await request("/api/briefs", { method: "POST", headers: { ...headers, Origin: "https://untrusted.example" }, body: JSON.stringify(payload) })).status, 403);
  const foreignHostStatus = await new Promise((resolve, reject) => httpGet(new URL("/api/briefs", base), { headers: { Host: "untrusted.example" } }, response => { response.resume(); resolve(response.statusCode); }).on("error", reject));
  assert.equal(foreignHostStatus, 403);
  assert.equal((await request("/api/briefs/invalid-id")).status, 400);
  assert.deepEqual(errors, []);
  console.log("PASS: duplicate import, live library update, search/filter, reader, XSS boundaries, record tabs, Markdown download, clipboard, reload link, manual upload, mobile navigation, deletion and local API validation.");
} finally {
  for (const id of ids) await request(`/api/briefs/${id}`, { method: "DELETE" });
  await browser.close();
}
