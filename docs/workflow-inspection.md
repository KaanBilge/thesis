# Inspecting research runs

Open **Research runs** in Thesis, or `/workflows`. The inspector reads local exports and the original run artifacts. It does not call a model or require an API key.

Import a completed run with its root Codex task ID:

```powershell
npm run workflow:import -- --run reports/AVGO/20260916T214341Z --thread 01a0ac2c-10d5-7be2-8925-b09fbe3a1f78
```

The importer discovers the root and descendants from session metadata under `$CODEX_HOME/sessions` (default: `~/.codex/sessions`). `--sessions DIRECTORY` supports another source directory. Only the selected task family is parsed. Exports live in git-ignored `data/workflows/`; original reports, financial artifacts, bound audit notes and session logs are unchanged.

Re-run this command to refresh the export. The UI's reload button reads the saved export; it does not re-collect logs. Preserve the export alongside your run backup. Artifact previews refer to the original run directory and verify the captured SHA-256 on each read.

## What the views contain

- **Agent workflow:** artifact handoffs, recorded model/effort, assigned input/output boundaries, accessible tool calls, command inputs/outputs, public messages, interruptions and per-agent turn ledgers.
- **Token usage:** exact per-agent categories, response ledger, cumulative chart, coordination observations, and scope selection.
- **Results & quality:** original scenario values, saved quality audit, coverage gaps and open findings.
- **Artifacts:** searchable run files, formatted Markdown or raw text, and integrity checks. HTML is displayed as text, never executed. Text preview is limited to 3 MB.

## Accounting rules

Prefer `token_usage_record.usage`, deduplicated by response ID within its owning thread. Never add all cumulative token-count snapshots. Sum root and child usage once. Final cumulative counters are cross-checked against the response sum. Older logs fall back to cumulative deltas with reset warnings; absent telemetry remains unknown.

`total = input + output`. Cached input is a subset of input. Reasoning output is a subset of output. Therefore uncached input is `input - cached`, and adding cached or reasoning again would double count.

Research-only scope ends at the first successfully completed coordinator turn. This boundary is disclosed in the UI and can be overridden using `--research-end ISO_TIMESTAMP`. Inspect the turn ledger when a task contains multiple projects or deliveries. Entire-task scope includes later importing and explanation. Incomplete/failed requests without usage records cannot be counted; displayed numbers are recorded usage, not a bill.

Subscription allowance percentages are account-wide and are not a fixed token or dollar conversion. The importer does not attribute account resets or unrelated activity to the run.

Exact handoff payloads in this desktop version are encrypted. The export identifies this gap and preserves declared boundaries from `dispatch-log.json`. It does not recover encrypted messages or relabel summaries as exact prompts. Private reasoning, system/developer messages, encrypted blobs and credential files are excluded. Recognizable credentials in public tool text are redacted.

## First-run observations: AVGO, September 16–17, 2026

Measured from seven session logs, cross-checked with their final cumulative counters:

| Scope | Total | Cached input | Uncached input | Output |
| --- | ---: | ---: | ---: | ---: |
| Research through first final response | 31,565,229 | 29,546,880 | 1,894,515 | 123,834 |
| Entire original task | 34,012,546 | 31,790,720 | 2,095,658 | 126,168 |

Research involved 277 recorded responses, one coordinator and six fresh workers. The coordinator accounted for 17,913,232 tokens (56.75%); evidence 4,850,975; evaluator 4,667,511; synthesis 2,130,639; bull 817,118; framework 623,958; bear 561,796. Four coordinator turns ended in usage-limit errors, followed by the fifth successful research attempt. Simultaneous worker errors should not be counted as independent five-hour allowances.

The coordinator's 31 responses issuing wait calls account for 4,548,558 tokens. This associates response context usage with the recorded action; it does not mean the wait tool itself bills tokens. The root's maximum research input was 181,893 tokens per response. Large contexts and repeated status responses are concrete candidates for optimization.

The run retained a passing 87.5/100 research-quality audit, with two open minor findings. Evidence collection disclosed missing provider configuration and incomplete coverage; the workflow also performed targeted financing follow-ups, source/calculation prechecks, modeling sensitivities and final audit. A final-artifact handoff race was recorded and repaired before audit binding. The audit is the saved original assessment, not a new independent review in this task.

Candidate improvements, not measured savings: compact coordinator receipts; fewer status-loop model responses; bounded extracts rather than full artifact rereads; deterministic capture of usage and completion receipts at every handoff; and an explicit final-author-complete barrier before the evaluator binds hashes. Preserve fresh bull/bear contexts and the quality gate. Test changes against a frozen baseline before adopting them or claiming cost savings.
