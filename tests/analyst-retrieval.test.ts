import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectResearch, type CollectResearchOptions, type SecFact } from "../src/analyst/retrieval";

// Entirely fictional provider responses. No credentials or network access are used.
const asOf = "2025-09-16T16:00:00.000Z";
const secEnv = { SEC_USER_AGENT: "Thesis test contact@fixture.invalid" };
const allEnv = { ...secEnv, FRED_API_KEY: "fred-fixture-secret", MASSIVE_API_KEY: "massive-fixture-secret" };
const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))); });
async function directory() { const path = await mkdtemp(join(tmpdir(), "thesis-retrieval-test-")); folders.push(path); return path; }
const accn = "0000000123-25-000010";
function filings(dates = ["2025-08-01"], accessions = [accn]) {
  return { accessionNumber: accessions, filingDate: dates, form: dates.map(() => "8-K"),
    acceptanceDateTime: dates.map((d) => `${d}T13:00:00Z`), reportDate: dates.map(() => "2025-06-30"),
    items: dates.map(() => "2.02,9.01"), primaryDocument: dates.map(() => "earnings.htm") };
}
function secSubmission() { return { cik: "123", name: "Fixture Corporation", tickers: ["TEST"], exchanges: ["Nasdaq"], sic: "3571",
  investorWebsite: "https://investors.fixture.invalid/", website: "https://fixture.invalid/", filings: { recent: filings(), files: [] } }; }
function secFacts() { return { cik: 123, facts: { "us-gaap": { Revenues: { label: "Revenues", units: {
  USD: [
    { val: 100, start: "2024-01-01", end: "2024-12-31", filed: "2025-02-01", accn: "0000000123-25-000001", form: "10-K", fy: 2024, fp: "FY" },
    { val: 105, start: "2024-01-01", end: "2024-12-31", filed: "2025-09-17", accn: "0000000123-25-000015", form: "10-K/A", fy: 2024, fp: "FY" },
    { val: 110, start: "2024-01-01", end: "2024-12-31", filed: "2025-09-16", accn: "0000000123-25-000014", form: "10-K/A", fy: 2024, fp: "FY" },
    { val: 55, start: "2025-01-01", end: "2025-06-30", filed: "2025-08-01", accn, form: "10-Q", fy: 2025, fp: "Q2" },
  ],
  EUR: [{ val: 90, start: "2024-01-01", end: "2024-12-31", filed: "2025-02-01", accn: "0000000123-25-000001", form: "10-K" }],
} } } } }; }
function identity() { return { status: "OK", results: { ticker: "TEST", cik: "0000000123", market: "stocks", locale: "us", type: "CS", currency_name: "usd" } }; }
function price(timestamp = "2025-09-15T04:00:00Z", close = 102) { return { o: 100, h: 104, l: 99, c: close, v: 1000, t: Date.parse(timestamp) }; }
function bars() { return { status: "OK", ticker: "TEST", adjusted: true, resultsCount: 1, results: [price()] }; }
type Handler = (url: URL, init?: RequestInit) => unknown | Response | undefined;
function fixtureFetch(handler?: Handler) {
  const requests: URL[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input)); requests.push(url);
    const override = handler?.(url, init);
    if (override !== undefined) return override instanceof Response ? override : Response.json(override);
    if (url.pathname === "/files/company_tickers.json") return Response.json({ "0": { cik_str: 123, ticker: "TEST", title: "Fixture Corporation" } });
    if (url.pathname === "/submissions/CIK0000000123.json") return Response.json(secSubmission());
    if (url.pathname.includes("companyfacts")) return Response.json(secFacts());
    if (url.pathname === "/fred/series") return Response.json({ seriess: [{ id: url.searchParams.get("series_id"), title: "Fixture macro series", units: "Percent", frequency: "Daily", seasonal_adjustment: "Not Seasonally Adjusted" }] });
    if (url.pathname === "/fred/series/observations") return Response.json({ realtime_start: "2025-09-15", realtime_end: "2025-09-15", count: 1, offset: 0,
      observations: [{ date: "2025-09-12", value: "4.2", realtime_start: "2025-09-15", realtime_end: "2025-09-15" }] });
    if (url.pathname.startsWith("/v3/reference/tickers/")) return Response.json(identity());
    if (url.pathname.startsWith("/v2/aggs/")) return Response.json(bars());
    throw new Error("Unexpected fixture URL " + url.href);
  }) as typeof fetch;
  return { requests, fetchImpl };
}
async function collect(overrides: Partial<CollectResearchOptions> = {}, handler?: Handler) {
  const outDir = overrides.outDir ?? await directory(), transport = fixtureFetch(handler);
  const packet = await collectResearch({ ticker: "TEST", asOf, outDir, env: allEnv, fetchImpl: transport.fetchImpl, macroSeries: ["DGS10"], minRequestIntervalMs: 0, maxRetries: 0, ...overrides });
  return { packet, outDir, ...transport };
}
async function factsFrom(dir: string): Promise<SecFact[]> { return (await readFile(join(dir, "financial-facts.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line)); }

describe("bounded research retrieval", () => {
  it("collects attributed evidence, preserves period and unit distinctions, and excludes later restatements", async () => {
    const { packet, outDir, requests } = await collect();
    expect(packet.components.sec.status).toBe("complete"); expect(packet.components.macro.status).toBe("complete"); expect(packet.components.prices.status).toBe("complete");
    expect(packet.issuer?.cik).toBe("0000000123");
    const facts = await factsFrom(outDir);
    expect(facts.map((fact) => fact.value)).toEqual([100, 55, 90]);
    expect(facts[1]).toMatchObject({ start: "2025-01-01", end: "2025-06-30", fiscalPeriod: "Q2", unit: "USD", accession: accn });
    expect(packet.components.sec.unitConflicts).toHaveLength(1);
    expect(packet.discovery.earningsFilings[0].url).toBe("https://www.sec.gov/Archives/edgar/data/123/000000012325000010/earnings.htm");
    expect(packet.discovery.investorRelationsUrls).toEqual(["https://investors.fixture.invalid/"]);
    expect(packet.discovery.browsingSupplementRequired).toBe(true);
    expect(packet.components.prices.latest).toMatchObject({ close: 102, date: "2025-09-15", aggregateWindowStart: "2025-09-15T04:00:00.000Z", kind: "completed-daily-aggregate" });
    expect(requests.every((url) => !url.hostname.includes("fixture"))).toBe(true);
    for (const source of packet.sources) {
      const content = await readFile(join(outDir, source.path), "utf8");
      expect(createHash("sha256").update(content).digest("hex")).toBe(source.sha256);
      expect(source.url).not.toContain(allEnv.FRED_API_KEY);
    }
  });
  it("returns explicit credential gaps and makes no calls without configuration", async () => {
    const { packet, requests } = await collect({ env: {} });
    expect(requests).toHaveLength(0);
    expect(Object.values(packet.components).every((c) => c.status === "missing")).toBe(true);
    expect(packet.issuer).toBeNull(); expect(packet.components.prices.latest).toBeNull();
    expect(packet.components.sec.gaps[0]).toContain("real contact");
  });
  it("rejects invented placeholder SEC contacts", async () => {
    const { packet, requests } = await collect({ env: { SEC_USER_AGENT: "Thesis user@example.com" } });
    expect(packet.components.sec.status).toBe("missing"); expect(requests).toHaveLength(0);
  });
  it("fetches relevant archive pages, enforces filing acceptance timestamps, and deduplicates", async () => {
    const { packet } = await collect({ env: secEnv }, (url) => {
      if (url.pathname === "/submissions/CIK0000000123.json") {
        const value = secSubmission();
        return { ...value, filings: { recent: filings(["2025-09-16", "2025-09-16"], [accn, "0000000123-25-000011"]),
          files: [{ name: "CIK0000000123-submissions-001.json", filingFrom: "2019-01-01", filingTo: "2023-12-31" }, { name: "CIK0000000123-submissions-002.json", filingFrom: "2000-01-01", filingTo: "2005-12-31" }] } };
      }
      if (url.pathname.endsWith("-submissions-001.json")) return filings(["2023-02-01"], ["0000000123-23-000001"]);
    });
    expect(packet.components.sec.filingCount).toBe(3);
    expect(packet.sources.some((s) => s.url.includes("-001.json"))).toBe(true);
    expect(packet.sources.some((s) => s.url.includes("-002.json"))).toBe(false);
  });
  it("excludes same-day filing metadata with no precise acceptance time and future acceptance", async () => {
    const { packet } = await collect({ env: secEnv }, (url) => {
      if (url.pathname === "/submissions/CIK0000000123.json") return { ...secSubmission(), filings: { recent: { ...filings(["2025-09-16", "2025-09-16"], [accn, "0000000123-25-000011"]), acceptanceDateTime: ["", "2025-09-16T20:00:00Z"] }, files: [] } };
    });
    expect(packet.components.sec.filingCount).toBe(0);
    expect(packet.components.sec.factCount).toBe(3);
  });
  it("rejects a mismatched companyfacts issuer while retaining valid discovery", async () => {
    const { packet } = await collect({ env: secEnv }, (url) => url.pathname.includes("companyfacts") ? { ...secFacts(), cik: 999 } : undefined);
    expect(packet.components.sec.status).toBe("partial"); expect(packet.components.sec.factsPath).toBeNull();
    expect(packet.components.sec.gaps.join()).toContain("CIK does not match");
  });
  it("does not accept malformed or empty financial payloads as usable financials", async () => {
    const malformed = await collect({ env: secEnv }, (url) => url.pathname.includes("companyfacts") ? { cik: 123, facts: { "us-gaap": { Assets: { units: { USD: [{ val: "100", end: "2025-06-30", filed: "2025-08-01" }] } } } } } : undefined);
    expect(malformed.packet.components.sec.factCount).toBe(0);
    expect(malformed.packet.components.sec.gaps.join()).toContain("malformed");
    const empty = await collect({ env: secEnv }, (url) => url.pathname.includes("companyfacts") ? { cik: 123, facts: {} } : undefined);
    expect(empty.packet.components.sec.gaps.join()).toContain("No eligible numeric");
  });
  it("paginates prices and FRED observations with fixed vintage and treats missing observations as null", async () => {
    const { packet, outDir } = await collect({}, (url) => {
      if (url.pathname === "/fred/series/observations") {
        const offset = Number(url.searchParams.get("offset"));
        return { realtime_start: "2025-09-15", realtime_end: "2025-09-15", count: 2, offset,
          observations: [{ date: offset ? "2025-09-12" : "2025-09-11", value: offset ? "." : "4.1", realtime_start: "2025-09-15", realtime_end: "2025-09-15" }] };
      }
      if (url.pathname.startsWith("/v2/aggs/")) return url.searchParams.has("cursor") ? bars() : { ...bars(), results: [price("2025-09-12T04:00:00Z")], next_url: "https://api.massive.com/v2/aggs/ticker/TEST/range/1/day/1757908800000/2025-09-15?cursor=second" };
    });
    expect(packet.components.prices.barCount).toBe(2);
    const macro = JSON.parse(await readFile(join(outDir, "macro-observations.json"), "utf8"));
    expect(macro[0].observations.map((o: { value: number | null }) => o.value)).toEqual([4.1, null]);
    expect(macro[0].requestedVintageDate).toBe("2025-09-15");
  });
  it("refuses revised macro data returned for the wrong vintage", async () => {
    const { packet } = await collect({}, (url) => url.pathname === "/fred/series/observations" ? { realtime_start: "2025-09-16", realtime_end: "2025-09-16", observations: [] } : undefined);
    expect(packet.components.macro.status).toBe("error"); expect(packet.components.macro.gaps.join()).toContain("historical vintage");
  });
  it("uses local calendar boundaries around UTC midnight", async () => {
    const { packet, requests } = await collect({ asOf: "2025-09-16T01:00:00Z" });
    expect(packet.components.macro.vintageDate).toBe("2025-09-14");
    expect(requests.find((u) => u.pathname.startsWith("/v3/reference"))?.searchParams.get("date")).toBe("2025-09-14");
  });
  it("withholds prices for wrong CIK, wrong ticker, or non-operating-company security type", async () => {
    for (const change of [{ cik: "999" }, { ticker: "OTHER" }, { type: "ETF" }, { type: "PFD" }]) {
      const { packet } = await collect({}, (url) => url.pathname.startsWith("/v3/reference") ? { ...identity(), results: { ...identity().results, ...change } } : undefined);
      expect(packet.components.prices.status).toBe("error"); expect(packet.components.prices.barsPath).toBeNull();
    }
  });
  it("rejects impossible OHLC prices, unadjusted bars, and conflicting duplicates", async () => {
    for (const change of [{ results: [{ ...price(), h: 50 }] }, { adjusted: false }, { results: [price(), price("2025-09-15T04:00:00Z", 103)] }]) {
      const { packet } = await collect({}, (url) => url.pathname.startsWith("/v2/aggs/") ? { ...bars(), ...change } : undefined);
      expect(packet.components.prices.status).toBe("error"); expect(packet.components.prices.latest).toBeNull();
    }
  });
  it("marks empty market-data results as missing evidence", async () => {
    const { packet } = await collect({}, (url) => url.pathname.startsWith("/v2/aggs/") ? { ...bars(), resultsCount: 0, results: [] } : undefined);
    expect(packet.components.prices.status).toBe("partial"); expect(packet.components.prices.latest).toBeNull();
    expect(packet.components.prices.gaps.join()).toContain("no eligible daily");
  });
  it("never follows hostile pagination URLs or changes issuer via pagination", async () => {
    for (const next_url of ["https://attacker.invalid/steal", "https://api.massive.com/v2/aggs/ticker/OTHER/range/1/day/2025-01-01/2025-09-15", "http://api.massive.com/v2/aggs/ticker/TEST/range/1/day/2025-01-01/2025-09-15"]) {
      const { packet, requests } = await collect({}, (url) => url.pathname.startsWith("/v2/aggs/") ? { ...bars(), next_url } : undefined);
      expect(packet.components.prices.status).toBe("error"); expect(requests.filter((u) => u.pathname.startsWith("/v2/aggs/")).length).toBe(1);
    }
  });
  it("does not leak credentials in persisted source URLs, echoed bodies, or thrown provider errors", async () => {
    const { packet, outDir } = await collect({}, (url) => {
      if (url.pathname === "/fred/series") return { seriess: [], echo: allEnv.FRED_API_KEY, url: `https://api.stlouisfed.org/?api_key=${allEnv.FRED_API_KEY}` };
      if (url.pathname.startsWith("/v3/reference/")) throw new Error(`network failure ${allEnv.MASSIVE_API_KEY}`);
    });
    const persisted = [await readFile(join(outDir, "retrieval-packet.json"), "utf8")];
    for (const name of await readdir(join(outDir, "raw"))) persisted.push(await readFile(join(outDir, "raw", name), "utf8"));
    expect(persisted.join()).not.toContain(allEnv.FRED_API_KEY); expect(persisted.join()).not.toContain(allEnv.MASSIVE_API_KEY); expect(persisted.join()).not.toContain(allEnv.SEC_USER_AGENT);
    expect(packet.components.prices.gaps.join()).toContain("[REDACTED]");
  });
  it("fails components independently on HTTP errors and bounds retries", async () => {
    let attempts = 0;
    const { packet } = await collect({ maxRetries: 1 }, (url) => {
      if (url.pathname === "/files/company_tickers.json") { attempts++; return new Response("access denied", { status: 503 }); }
    });
    expect(attempts).toBe(2); expect(packet.components.sec.status).toBe("error"); expect(packet.components.macro.status).toBe("complete");
    expect(packet.components.prices.status).toBe("partial"); expect(packet.components.prices.identityVerified).toBe(false);
  });
  it("refuses redirects, oversized bodies and malformed JSON", async () => {
    for (const response of [new Response(null, { status: 302, headers: { location: "https://attacker.invalid" } }), new Response("x".repeat(2000)), new Response("<html>not JSON</html>")]) {
      const { packet } = await collect({ env: secEnv, maxResponseBytes: 1024 }, (url) => url.pathname === "/files/company_tickers.json" ? response : undefined);
      expect(packet.components.sec.status).toBe("error");
    }
  });
  it("reports bounded pagination instead of claiming complete coverage", async () => {
    const { packet } = await collect({ maxPages: 1 }, (url) => url.pathname.startsWith("/v2/aggs/") ? { ...bars(), next_url: "https://api.massive.com/v2/aggs/ticker/TEST/range/1/day/2025-09-15/2025-09-15?cursor=next" } : undefined);
    expect(packet.components.prices.status).toBe("partial"); expect(packet.components.prices.gaps.join()).toContain("page budget");
  });
  it("rejects invalid inputs and refuses a run-directory identity collision", async () => {
    const outDir = await directory();
    for (const overrides of [{ ticker: "../AAPL" }, { asOf: "2025-09-16" }, { maxPages: 0 }, { macroSeries: ["DGS10", "DGS10"] }]) {
      await expect(collectResearch({ ticker: "TEST", asOf, outDir, env: {}, ...overrides })).rejects.toThrow();
    }
    await collect({ env: {}, outDir });
    await expect(collectResearch({ ticker: "AAPL", asOf, outDir, env: {} })).rejects.toThrow("different ticker or cutoff");
  });
});
