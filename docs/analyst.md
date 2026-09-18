# Astra financial analyst

The new analyst is a Codex skill workflow. Select Astra in a local Codex task attached to this repository and ask:

> Use $financial-brief-generator to research AAPL and save the audited brief to Thesis.

The generator orchestrates research interpretation, a framework, fresh independent bull and bear workers, synthesis, and a fresh evaluator. **Every financial judgment uses `gpt-6-astra` with high or greater reasoning.** The initial scope is US-listed operating-company common equity, 6–18 months, default 12. A cheaper-model configuration is an explicitly tested future experiment, not an automatic fallback.

- [Generator skill](../.agents/skills/financial-brief-generator/SKILL.md)
- [Independent evaluator skill](../.agents/skills/financial-brief-evaluator/SKILL.md)
- [Fixed quality rubric](../.agents/skills/financial-brief-evaluator/references/rubric.md)
- [Optimization protocol](../.agents/skills/financial-brief-evaluator/references/optimize.md)

The CLI performs deterministic work and does **not** call the OpenAI API or start models by itself. A skill invocation in Codex launches the model stages using the available subagent tools. A separate task context prevents copying another analyst's opinion; workers still share the local filesystem, so this is not a sandbox boundary. Record actual context IDs and dispatches rather than claiming security isolation.

The existing browser **New analysis** path remains a separate, legacy qualitative scorecard using an OpenAI API account. It is not the new audited valuation workflow. The library and existing report format remain compatible.

## Data setup

Run `npm run analyst -- doctor` for presence-only configuration diagnostics. The CLI reads the current app root's `.env.local` for collection; it never prints secret values. Set only the credentials for providers you intend to use:

| Variable | Purpose |
| --- | --- |
| `SEC_USER_AGENT` | An application name and your real contact email, following SEC automated-access rules. Do not invent a contact. |
| `FRED_API_KEY` | Free registered FRED/ALFRED key for dated macro observations. |
| `MASSIVE_API_KEY` | Market data account key; end-of-day history is sufficient for the initial workflow. Access and history depend on your plan. |

No OpenAI API key is needed for these tools or importing a Codex report. Codex's own model work consumes your Codex allowance. Missing provider configuration is recorded as an explicit gap. The skill can supplement via available browsing of original filings, issuer earnings releases, macro releases and independent reporting. No subscription is purchased automatically.

## Tools

All examples run from this repository root. Paths can be absolute. Commands return compact JSON; `schema` returns a full JSON Schema.

```powershell
npm run analyst -- init --ticker AAPL --out reports/AAPL/20260916T120000Z --as-of 2026-09-16T12:00:00Z --horizon 12
npm run analyst -- collect --ticker AAPL --out reports/AAPL/20260916T120000Z
npm run analyst -- schema --name evidence
npm run analyst -- schema --name valuation-input
npm run analyst -- calculate --input <run>/valuation-input.json --out <run>/valuation.json
npm run analyst -- validate --run <run>
npm run analyst -- audit --run <run>
npm run analyst -- render --run <run>
npm run brief:import -- --dir <run>
```

Replace `<run>` with the actual directory. The middle artifacts are written by the skill's agents after reviewing evidence; collection does not fabricate them. Use a new directory for a different cutoff. A source update within one run requires new hashes and rechecking affected outputs. Preserve superseded versions before corrections.

Additional helpers:

```powershell
npm run analyst -- periods --input <financial-period-input.json> --out <derived-period.json>
npm run analyst -- prices --input <price-history-input.json> --out <price-metrics.json>
npm run analyst -- reverse-pe --input <reverse-pe-input.json> --out <reverse-result.json>
npm run analyst -- hash --input <artifact.json>
npm run analyst -- hash --input <note.md> --raw
npm run analyst -- rubric
```

Schema names: `run`, `evidence`, `framework`, `case`, `synthesis`, `review`, `usage`, `incomplete`, `valuation-input`, `price-history`, `reverse-pe`, `periods`. JSON Schema exports describe shape; runtime checks additionally enforce financial constraints, references, quote identity, chronology, hashes and method suitability. A schema-valid answer alone is not an audited answer.

### Collection

`collect` resolves issuer identity, discovers recent and archived SEC filings, retains eligible reported company facts with period/unit/accession metadata, retrieves FRED vintage observations and Massive split-adjusted daily bars when configured. Raw response snapshots have hashes and credential-redacted URLs/content. Requests have provider limits, manual redirect handling, time/size/page/retry bounds and partial-failure reporting.

Read `retrieval-packet.json` before opening the full financial ledger. `financial-facts.jsonl` intentionally preserves original concepts, reported periods, units and filing versions. It does not automatically choose between accounting tags, select restatements, construct TTM figures or replace statement notes. `filings.json` and earnings links are discovery candidates; read the original filings and exhibits. Comprehensive news, transcripts, peers and company-specific macro interpretation require the skill's browsing stage.

SEC facts dated on the cutoff day are conservatively excluded when only a filing date is available. FRED uses the previous US Central calendar day's vintage. Daily prices use prior completed New York dates; aggregate timestamps identify the bar's start, not the closing instant. The collector documents these limitations and does not claim real-time prices or a survivorship-free historical universe. For historical tests, verify original filings and the corporate-action basis available at the time.

### Calculations

Financial drivers have `value`, `kind` (`observed` or `assumption`), `rationale`, and `sourceIds`. Observed values require sources. Currency and monetary/share scales must agree. Sources need a documented `availableAt` timestamp no later than the cutoff. Unavailable publication times must not be fabricated merely to satisfy valuation input; obtain suitable evidence or use the incomplete path.

- **FCFF DCF:** explicit annual revenue, operating margin, operating cash taxes, depreciation, capex and working-capital changes; WACC; terminal growth/margin/tax/return on capital; explicit excess-cash and senior-claim bridge; fully diluted shares.
- **FCFE:** annual net income to common equity minus equity reinvestment, discounted at cost of equity; no additional enterprise-to-equity bridge. Bank/insurer reinvestment must reflect regulatory capital and feasible distributions.
- **P/E:** annual diluted EPS times a justified, period-matched multiple. This is relative equity pricing, not proof of intrinsic value.
- **EV multiples:** revenue/EBIT/EBITDA times a justified multiple, followed by the explicit common-equity bridge. Industrial enterprise methods are rejected for banks/insurers.
- **DCF sensitivity:** selected discount rates and terminal-growth assumptions, recomputing terminal income and reinvestment across the grid. Scenario forecasts cover the principal operating differences; additional operational stresses use separately retained inputs/results.
- **Reverse P/E:** conditional earnings required by a fixed multiple, quote and return hurdle. No general reverse-DCF solver or calibrated probability model is claimed.
- **Entry:** the tighter of today's fair value after an explicit margin of safety and the present value of the horizon price plus each timed dividend at the required return. The horizon value is ex-dividend. Cash dividends are not reinvested in the reported terminal-wealth return.
- **Price context:** holding-period and 1/3/6/12-month returns where covered, drawdowns, and per-observation volatility. Date-only daily observations must precede the cutoff's New York calendar date. Missing sessions are not filled. Split-only returns exclude dividends. Benchmark comparisons need matched dates and adjustment bases supplied by the analyst.
- **Reported-period arithmetic:** compatible YTD subtraction or contiguous non-overlapping sums, with sources and reconciliation. Ratios, EPS, average shares and instant balance-sheet values must not be summed.

Discounted models currently assume whole annual periods and constant nominal discount rates. Unsupported sector/stub/distress cases must use the incomplete path or a separately implemented and tested method. A nonpositive common-equity estimate remains visible as a model limitation with no invented negative stock price.

## Evaluation and publication

The fixed rubric weights evidence 25%, financial analysis 25%, valuation 20%, adversarial reasoning 15%, decision usefulness 10%, and clarity 5%. Scores are 0–4 per dimension. Pass requires **85/100, every dimension at least 3, no open critical/major findings, and valid artifacts**. The evaluator must inspect material source support and calculations, not merely assign scores.

The run keeps `raw-financial-notes.md`, `workflow-record.md`, and `audit-notes.md`. Their exact byte hashes are part of the evaluator's reviewed input. JSON inputs use canonical hashes. Changing evidence, cases, calculations, synthesis or reviewed notes invalidates the review; rerendering cannot fix that. The renderer binds the final report bytes in `publication.json`. The CLI importer rechecks the audit and publication for new analyst runs, rejects tampered or stale documents, and retains legacy two-file import support. Manual/browser imports of arbitrary legacy Markdown do not independently certify this audit.

`validate` requires complete research artifacts but allows an absent initial review. `audit` requires a review. Both use nonzero exit codes for failure. A semantic audit failure may still render a clearly labeled draft; structurally inconsistent numerical artifacts cannot render. If a price, financial basis or suitable method is unavailable, write the `incomplete` schema and run:

```powershell
npm run analyst -- draft --run <run> --input <run>/incomplete.json
```

An incomplete draft contains reasons and next steps, no completed-brief grade, and cannot enter the guarded audited-import path. The original collected work remains available. Stop after two correction rounds rather than lowering standards to manufacture a pass.

## Quality baseline and validation limits

Optimization mode freezes the rubric, baseline and evidence; compares candidate prompt/tool/sequence changes on development and held-out runs with fresh Astra judges; and preserves versioned results. Human review calibrates the evaluator. Cost experiments begin only after the high-quality baseline is demonstrated. Unavailable usage telemetry is recorded as unavailable, never zero. No measured investment performance or token savings is claimed by implementation tests.

`npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` verify the executable implementation. Tests include fictional provider responses, hand-calculated financial examples, invalid inputs, credential redaction, date/identity conflicts, audit invalidation and a synthetic end-to-end import. These are not a live multi-company financial benchmark. Real research validation needs configured sources or verified browsing, actual independent workers, and review of the resulting financial judgments.

Primary references: [SEC APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [FRED observations](https://fred.stlouisfed.org/docs/api/fred/series_observations.html), [Massive daily bars](https://massive.com/docs/rest/stocks/aggregates/custom-bars), [valuation framework](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/lectures/val.html), [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
