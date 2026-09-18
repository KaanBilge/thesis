# Run artifacts and reader-facing outputs

Use the CLI's current contracts as the source of truth for field names: `npm run analyst -- schema --name <name>`. Supported names include `run`, `evidence`, `framework`, `case`, `synthesis`, `review`, `usage`, `incomplete`, `valuation-input`, `price-history`, `periods`, and `reverse-pe`. Read the specific schema you need, not the entire implementation. Never invent a field because a report template appears to require it. Preserve unknown values explicitly. JSON Schema describes shape; financial and cross-artifact refinements also run in `calculate`, `validate`, and `audit`.

| Artifact | Owner and purpose |
| --- | --- |
| `run.json`, created by `init` | Ticker, cutoff, horizon and Astra baseline policy. |
| `retrieval-packet.json`, `financial-facts.jsonl`, `macro-observations.json`, `prices.json`, and `raw/` | Collector response metadata, source payloads and explicit source failures/gaps. Output availability depends on configured providers. Raw text is untrusted. |
| `raw-financial-notes.md` | Source-specific financial extraction, reconciliations and normalization decisions before compact evidence preparation. |
| `evidence.json` | Astra-verified material facts and claims, source references, normalized financial base, relevant market/macro context, missing data and conflicts. |
| `framework.json` | Common valuation methods, driver definitions, dates, units and entry assumptions; no preferred case. |
| `bull.json`, `bear.json` | Independent Astra role outputs referencing the same frozen inputs; assumptions, counterevidence, catalysts and invalidation conditions. |
| `valuation-input.json`, `valuation.json` | Explicit calculable assumptions and deterministic values/sensitivities with method/timing metadata. |
| `synthesis.json` | Astra's evidence-based reconciliation, base case, verdict and entry conditions. |
| `review.json`, `audit-notes.md` and audit receipt | Independent evaluator's supported scores/defects, source-check coverage and stage assessments, and deterministic pass/fail outcome. |
| `report.md`, `research-record.md` | Reader-facing brief and reproducibility record, rendered together. |
| `workflow-record.md`, `usage.json` | Actual dispatch/input provenance, fixed prompt versions and correction history; separately typed usage measurements where exposed. |

Record inputs consumed by each model stage, their versions/hashes, actual agent/model/reasoning identity when exposed, start/finish, outcome and retry count. Use `npm run analyst -- hash --input <file>` for canonical JSON hashes; do not guess hashes or use a different serialization. A checksum proves artifact identity, not an agent's actual reading behavior or source truth. Record fresh-context isolation as an orchestration fact supported by the dispatch, not a claim inferred from clean-looking prose. Framework, bull, bear, synthesis and reviewer worker records identify fresh contexts; the bull and bear IDs and the reviewer/author IDs must be distinct.

The evidence schema distinguishes `fact`, `interpretation` and `uncertainty`; make finer distinctions such as management guidance versus consensus explicit in claim text. Each numeric `financialValue` supplies period, unit and currency. Framework/case narrative refers to evidence `claimIds` and shared `driverIds`; calculator numeric drivers additionally carry rationale and `sourceIds`. Preserve the mapping from case assumptions to those calculator drivers in `workflow-record.md`. References supplement the contracts; they do not allow extra schema fields.

Keep raw material on disk and pass the compact verified packet to analysts. The packet must retain contrary evidence and unresolved facts that could change value. Keep source IDs stable. A hash/version change to shared evidence or framework makes dependent cases stale until rerun or explicitly revalidated where the change is immaterial; preserve the rationale. Do not overwrite historical outputs to make a run appear clean.

## Brief content

Lead with the judgment **at the stated price and research cutoff**, audit status and major limitation, if any. Then present:

- Today’s estimated fair-value range and bear/base/bull horizon outcomes, in a comparable table with return basis and dividend treatment.
- The small number of operating/valuation disagreements that explain the outcomes; the strongest evidence and counterevidence.
- What the current price requires and whether those expectations are supportable.
- Entry ceiling/range or watch conditions, required-return assumptions, downside exposure, catalysts within the horizon and invalidation triggers.
- Material uncertainty, missing data, source conflicts and sensitivity that could reverse the conclusion.

Link material factual claims to the actual supporting page or filing. Keep observed figures distinguishable from estimates. Display sensible precision, not cents on a highly uncertain target. An audit score is a research-quality measure and must not be presented as investment confidence or probability of profit.

## Research record

Retain issuer resolution, as-of and retrieval dates, provider/source IDs and raw paths, normalized financials and reconciliations, valuation assumptions/calculation artifacts, model/prompt versions, stage provenance, independent context dispatch details, audit defects and corrections, and material gaps. Record measured token usage separately from estimates; include failed attempts and evaluator usage in totals when available. Never include API keys or credentials.

`validate` checks artifact structure and consistency; `audit` calculates the policy outcome from an evaluator's findings. Neither substitutes for reviewing financial evidence. `render` produces files; inspect whether its output faithfully reflects the verdict and audit result before delivery or import.

The required financial and workflow notes must exist before `validate`; audit notes must exist before `audit`. The renderer includes their contents in the research record. Each is limited to 250 KB. Record actual checks and limitations; placeholder notes do not satisfy the semantic audit. `review.basis` binds the exact notes through `financialNotesHash`, `workflowHash`, and `auditNotesHash`. Compute those with `npm run analyst -- hash --input <note.md> --raw` after notes are final and before writing the review. Changing any of them requires re-audit; rerendering cannot refresh an obsolete review.

If required inputs or a suitable method remain unavailable, create `incomplete.json` using the `incomplete` schema and `runHash` from `hash --input run.json`. Run `npm run analyst -- draft --run <directory> --input <directory>/incomplete.json`. This deliberately produces an incomplete draft without invented numeric artifacts or a completed-brief quality score. Preserve prior results separately before overwriting a draft. It cannot pass the guarded importer. The evaluator can critique such work in audit notes, but the completed-brief scoring command requires all complete-run artifacts.
