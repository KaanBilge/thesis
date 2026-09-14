<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Codex research handoff

For prompts such as “Research AAPL and save to Thesis”:

1. Use the installed `us-stock-brief` skill for fresh US company research. Keep its evidence requirements and save `report.md` and `research-record.md` together under `reports/TICKER/YYYYMMDDTHHMMSSZ/`. For an existing completed report, reuse the files without researching or rewriting them. Respect the skill's exclusions for funds; user-requested broader research can be imported with `--kind thesis`.
2. From THIS app directory, run:

   `npm run brief:import -- --dir <research-folder> --company "<resolved issuer>" --model <actual-model>`

   The directory is relative to the working directory, or absolute. When reports live in the parent workspace, use `../reports/...`. The folder timestamp supplies the research cutoff; override it with `--as-of <ISO-timestamp>` if different. Omit `--model` if unknown; never invent attribution. `--kind thesis` is optional for a broader investment thesis.
3. Read the compact JSON receipt. Return its `path` as a link on the running Thesis origin (normally `http://127.0.0.1:3001`). Start `npm run dev -- --port 3001` if a preview is needed and no app is running; if that port is occupied, use the actual available port. Import itself works offline, with the app closed and without an API key.

Do not re-emit the report into JSON, re-read the entire repo, manufacture scorecard fields, or run a second model pass for the handoff. Identical content and metadata return `already-saved` with the same ID; changed content is a new version. `--check` validates without writing. Detailed setup and HTTP contract: `docs/codex-handoff.md` (read only when needed).
