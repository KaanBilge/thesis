# Thesis

A local-first stock research workspace: current evidence, a precommitted methodology, independent bull and bear cases, and a transparent conclusion. **Not financial advice.** Scores are research judgments, not predictions or instructions to trade.

## Research in Codex

Select Astra in a Codex task attached to this workspace and ask: **“Use $us-stock-brief to research AAPL and save it to Thesis.”** The project instructions import the completed `report.md` and `research-record.md` without another model call. No API key is needed for this handoff.

The redesigned library supports searching, filtering, direct report links, Markdown downloads, and the full evidence record. Existing scored analyses remain available under **New analysis**. [Codex handoff guide](docs/codex-handoff.md) covers the one-command importer, repeat detection, and local HTTP contract.

## Local setup

Requires Node.js 22 or newer (tested with Node 24) and npm. An OpenAI API account is needed only for the separate scored-analysis pipeline; Codex brief imports work without one.

Run commands **inside this new app's `thesis` folder**. This app was created separately from the existing parent project; it does not use that project's source, database, or configuration.

```powershell
npm install
# Only if .env.local does not already exist:
Copy-Item .env.example .env.local
```

Edit `.env.local` in a text editor:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4
ANALYSIS_CACHE_HOURS=24
```

Fill in the API key locally, then run:

```powershell
npm run dev
# If port 3000 is occupied:
npm run dev -- --port 3001
```

Open the local address printed by Next.js. The scripts bind to `127.0.0.1`. There is no login or browser API-key input. With no key, the interface and existing history still work; starting new research returns setup instructions. API requests incur your OpenAI account's normal charges.

Change `OPENAI_MODEL` to another model supporting Responses, strict Structured Outputs, and web search; restart the server after environment changes. The selected model is captured for each job. There is no silent model substitution. `ANALYSIS_CACHE_HOURS` must be a positive number up to 8,760; changes apply to newly created analyses, not existing expiration dates.

## Architecture

- **Next.js 16.3.4 App Router**, TypeScript, React, Tailwind CSS. Self-hosted IBM Plex Sans and local assets; no font or analytics services.
- `src/components/`: history, input, real job progress, report, evidence/source disclosures, and responsive layouts.
- `src/server/ai/`: separate research, methodology, bull, bear, and orchestrator modules. Versioned prompts live in `prompts.ts`.
- `src/server/pipeline.ts`: stage ordering, frozen inputs, parallel analysts, cancellation, scoring, and atomic save.
- `src/lib/schemas.ts`: strict Zod contracts. `schemas/` contains generated strict JSON schemas; regenerate with `npm run schemas`.
- `src/server/db/`: SQLite using `better-sqlite3` and Drizzle ORM. `drizzle/` contains versioned SQL migrations.
- `src/server/http.ts`: bounded JSON input, ticker/ID validation, loopback host and same-origin checks, and sanitized errors.

OpenAI calls run only in modules protected by `server-only`, using the official JavaScript SDK and Responses API. Requests use `store: false`, SDK logging is disabled, and the API key is never serialized into an analysis or response. Framework telemetry is disabled by the cross-platform launch script. Browser traffic stays with the local app except when you open a cited source. Research requests and frozen packets are sent to OpenAI; “local-first” does not mean offline AI or zero provider processing/retention. No cloud database, authentication, tracking, analytics, or deployment configuration is included.

## AI pipeline

1. **Research:** require web search; identify the requested listing and gather dated evidence. Source URLs must occur in the Responses tool/citation provenance. Facts require a source and observation period. Missing/conflicting information is explicitly uncertainty.
2. **Methodology:** select 5–8 unique metrics with positive integer weights totaling exactly 100. Specify company-specific rationale, evidence needs, scoring guidance, and an evaluation horizon.
3. **Bull and bear:** run concurrently against the same deeply frozen packet and methodology. Every argument links to original claims and their citations; each includes counterevidence. Both analysts score the support for their own side across every metric.
4. **Orchestrator:** impartially evaluate both cases against the unchanged metrics. Validate all references, weights, and net-score arithmetic.
5. **Application:** compute aggregate and confidence deterministically, then atomically save the complete report and complete its job.

Strict schemas reject unknown fields, malformed JSON, missing fields, and out-of-range values. Additional validation enforces weight totals, unique IDs, complete metric coverage, citation linkage, and arithmetic. Invalid structured responses get **one** correction attempt. Authentication, network errors, and refusals do not trigger schema retries. No important model output is extracted with regular expressions; input/URL patterns are only validation.

Each API call times out after 120 seconds, with a 10-minute pipeline deadline. If one analyst fails, the other is aborted. Error responses use fixed, actionable messages and do not expose raw provider errors. No partial analysis is saved.

## Scoring

Bull and bear scores each measure the **strength of evidence for that side**, from 0 to 100. They do not have to add to 100.

```text
Net metric score = (bull score + 100 - bear score) / 2
Overall score = round(sum(net metric score × weight / 100))

65–100: Bullish
45–64:  Neutral
 0–44:  Bearish
```

The application recomputes net scores and weights, rounds only the final aggregate, and determines the verdict. The model has no overall-score or verdict field to override. The decision paragraph summarizes the evidence; the adjacent computed band is authoritative.

Confidence is independent of direction:

```text
Quality = weighted average of orchestrator data-quality assessments
Agreement = weighted average of 100 - abs(bull analyst strength - (100 - bear analyst strength))
Analyst confidence = lower of the two analysts' confidence values
Confidence = min(Quality, round(0.60 × Quality + 0.25 × Agreement + 0.15 × Analyst confidence))
```

The three inputs are rounded to integers. Metrics supported solely by uncertain or missing information cannot have quality above 25. Confidence is a heuristic research-quality indicator, not a calibrated probability. The UI exposes its components and formula.

## SQLite, history, and cache

The first database request creates `data/thesis.sqlite` and applies committed Drizzle migrations automatically. No separate database server or setup command is needed. SQLite uses WAL and a busy timeout. To change the schema, edit `src/server/db/schema.ts`, run `npm run db:generate`, review the generated SQL, and restart the server. To back up, stop the app and copy the `data` folder (including any WAL/SHM files).

Each analysis stores its full structured report, ticker/company, verdict, score/confidence, research/creation dates, model, per-stage and aggregate prompt versions, SHA-256 research hash, cache key, and expiry. The logical key is the JSON tuple `[normalized ticker, UTC research date, model, prompt version]`.

Before scheduling any AI work, the app looks up the latest unexpired record for that ticker, model, and prompt version, including a still-valid record from a prior research day. Cache lifetime starts at research retrieval, not completion. Cache hits make **zero** OpenAI calls, do not create duplicate history entries, and show a cached-result badge. Refresh bypasses cache and saves a new entry. Expiration affects reuse, not history visibility. Deleting a history entry also removes that entry from the cache.

Jobs and progress also live in SQLite. A unique partial index permits only one running job per ticker, including refreshes and requests across database connections. Duplicate requests receive the existing job ID. A stale job lease expires after 10 minutes 30 seconds; interrupted jobs then become retryable. The server must remain running for research to finish. After a browser reload, submit the same ticker to reconnect or retrieve its completed cached report.

## Local endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /api/analysis` | `{ "ticker": "AAPL", "refresh": false }`; cached report (200) or job (202) |
| `GET /api/analysis/:jobId/progress` | Durable stage status, result ID, or recoverable error |
| `GET /api/history` | Saved history summaries |
| `GET /api/history/:id` | Open the full report |
| `DELETE /api/history/:id` | Delete one report and its cache entry |
| `POST /api/history/:id/refresh` | Bypass cache for the saved ticker |
| `GET /api/status` | API-key presence as a boolean; never returns the key |

Responses use `Cache-Control: no-store`; the app's explicit SQLite cache controls reuse. Progress uses polling rather than streamed tokens, so unvalidated partial model output never reaches the browser.

## Validation

```powershell
npm test
npm run lint
npm run build
# Optional local production server after the build:
npm start -- --port 3001
```

Tests cover methodology constraints, arithmetic and verdict boundaries, independent confidence, cache keys/expiry and midnight behavior, strict JSON compatibility, citation validation, correction retries, errors, input/origin checks, SQLite history, durable duplicate protection, and the full ordered/concurrent pipeline with mocked Responses transport. Fixtures are explicitly fictional and are never seeded into the app. No real API key or paid model calls are required for tests.

## Current limitations

- Fresh AI research requires internet access, an API key, supported model tools, and sufficient account quota. If web search is unavailable, the app fails clearly rather than generating current facts from memory.
- Web provenance proves that a URL was encountered, **not** that every interpretation accurately reflects the source. Source support, company identification, financial extraction, and confidence remain model judgments requiring human verification. Paywalls, stale filings, ambiguity, and unavailable figures can reduce quality.
- This is a qualitative research MVP, without a licensed real-time quote feed, price targets, portfolio analysis, order execution, or calibrated return forecasts. Tickers must begin with a letter; numeric-only exchange tickers are not supported.
- One model plays the different roles; separate prompts and concurrent execution do not guarantee independent reasoning. The framework is fixed before debate but is itself generated by AI.
- History is single-user and local. There is no encryption-at-rest layer, durable background worker, interrupted-stage resumption, or automatic cache refresh. Use the local launch scripts and do not expose the app to a network.

Implementation references: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Responses web search](https://developers.openai.com/api/docs/guides/tools-web-search), [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4), and the version-matched Next.js guides bundled in `node_modules/next/dist/docs/`.
