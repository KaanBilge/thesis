# Codex → Thesis

In a Codex task attached to this workspace, select Astra and send:

> Use $us-stock-brief to research AAPL, then save the completed brief and research record to Thesis.

The project instructions route the finished files through a deterministic importer. The import makes **zero model calls**, needs no OpenAI API key, and works when the web app is closed. Research still uses Codex tokens. This does not embed or remotely control Codex from the website; the prompt runs in your Codex task.

## Import a completed run

From the newer `thesis/` app:

```powershell
npm run brief:import -- --dir ../reports/AAPL/20260914T120000Z --company "Apple Inc." --model gpt-6-astra
```

Only two existing UTF-8 files are read: `report.md` and `research-record.md`. Each must contain text and be at most 1 MB. No report text must be copied into the command. Ticker and cutoff are inferred from `TICKER/YYYYMMDDTHHMMSSZ`; use `--ticker` or `--as-of` when that convention does not match. `--as-of` is an ISO date/time with timezone. Use the actual research cutoff, not the upload time. Company defaults to ticker; model defaults to “Not recorded”. Pass only known metadata. `--kind thesis` imports broader investment theses; default is `stock-brief`.

Add `--check` for validation without opening or changing the database. Missing files, invalid metadata and oversized files exit nonzero. A successful import prints one compact JSON receipt:

```json
{"status":"saved","id":"…","ticker":"AAPL","path":"/?brief=…","contentHash":"…"}
```

Repeat the command unchanged and the receipt says `already-saved`, with the same ID. A changed report, record, cutoff or metadata gets a new ID, retaining the previous version. SHA-256 covers the versioned, normalized metadata plus both exact document strings; imports are atomic and the unique hash index also handles concurrent repeats.

The database is always the newer app's `data/thesis.sqlite`, even if you invoke the script with an absolute path from another directory. `THESIS_DATABASE_PATH` overrides it for isolated tests; apply the same override to the server and CLI. The original parent app remains separate.

## In the browser

Start `npm run dev -- --port 3001`, then open [Thesis](http://127.0.0.1:3001). The library checks metadata every five seconds while visible and refreshes on window focus. Search and filter imported briefs alongside existing scored analyses. Use a receipt's `path` on the app's actual origin to open that report directly, including after a restart. Files can also be selected under **Codex handoff → Import existing files**.

The reader shows the report, research record, source links, research cutoff, recorded model and integrity hash. Each document can be downloaded as Markdown. Raw HTML, external images, and links other than HTTP(S) are disabled; document contents are preserved in storage. Importing does not verify claims or convert prose into a confidence score. Deleting a library entry leaves its original research files intact.

## Local HTTP interface

| Route | Purpose |
| --- | --- |
| `POST /api/briefs` | Validate and save a brief, or return an existing identical import |
| `GET /api/briefs` | Metadata only, newest research first |
| `GET /api/briefs/:id` | Both documents and their metadata |
| `DELETE /api/briefs/:id` | Remove one saved import |

POST accepts `{version:1,ticker,companyName,kind,asOf,model,report,researchRecord}`. `version`, `kind`, and `model` may be omitted to use the defaults above. Unknown fields are rejected. `asOf` must include a timezone. New imports return 201; repeats return 200 with `duplicate:true`. Responses include `brief` and `path`. POST bodies are capped at 2.1 MB including JSON overhead; all routes enforce loopback hosts and same-origin browser requests, with `Cache-Control: no-store`.

Prefer the CLI for Codex tasks: it transfers files directly, returns a tiny receipt and has no dependency on a running browser or server. The separate **New analysis** workflow still uses your OpenAI API configuration and its existing paid research pipeline.

The project instruction mechanism follows [official Codex AGENTS.md guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

## Repeatable verification

`npm test`, `npm run lint`, and `npm run build` cover the import contract and existing research pipeline. The browser test also exercises imports, repeat detection, automatic library updates, Markdown safety, downloads, mobile navigation, and local HTTP boundaries.

To run it, start a separate built app with `THESIS_DATABASE_PATH` pointing to an empty test database, then set `THESIS_TEST_URL` to that local address and run `node scripts/test-ui.mjs`. It requires Playwright (`PLAYWRIGHT_MODULE` can point to an existing installation), and defaults to headless Edge (`PLAYWRIGHT_CHANNEL` can select another installed Chromium channel). The test removes only the brief IDs it created. Do not point it at a personal research library.
