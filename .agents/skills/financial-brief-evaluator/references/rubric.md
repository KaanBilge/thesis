# Fixed quality rubric — version 1

Scores are integers from **0 through 4**. Use the evidence anchors below. Compute `overall = Σ(weight × score / 4)` without rounding before the pass comparison. All six dimensions are required; do not redistribute weight for a missing dimension. The CLI is the authority for arithmetic and thresholds; report any conflict between implementation and this rubric as a workflow defect.

| Dimension | Weight | What is being judged |
| --- | ---: | --- |
| Evidence | 25 | Identity, direct source support, provenance, freshness/as-of integrity, relevant coverage and treatment of conflicts/missing data. |
| Financial | 25 | Period/unit normalization, accounting quality, cash conversion, financial position, share count/dilution and internally consistent driver forecasts. |
| Valuation | 20 | Suitable methods, reproducible arithmetic, equity bridge, discounting/timing, defensible assumptions, sensitivity and current-price expectations. |
| Adversarial | 15 | Independent case generation, same verified inputs, serious counterevidence, falsifiable cases and synthesis that resolves disagreements. |
| Decision | 10 | Horizon/catalyst alignment, justified entry conditions, return/downside definitions and honest uncertainty. |
| Clarity | 5 | Traceable facts versus estimates, comparable cases, concise explanation of decisive drivers and faithful reporting of audit/limitations. |

## Score anchors

- **4 — Excellent:** decision-relevant claims have direct support; assumptions and material limitations are explicit; the dimension's checks are complete and economically sound; remaining issues do not impair the judgment.
- **3 — Strong:** the dimension supports the conclusion and has no material unresolved defect; minor shortcomings are identified and bounded. A source-backed assumption may remain uncertain without being defective.
- **2 — Insufficient:** an unresolved material gap or weak reasoning could affect value, case comparison or the entry assessment; more work is necessary.
- **1 — Poor:** substantial unreliability, inadequate coverage, unsupported inference or inappropriate method undermines the dimension.
- **0 — Missing/invalid:** the dimension is absent, fabricated, unusable or contradicted by decisive evidence.

Apply anchors to the criterion, not to writing length. Unsupported confidence does not deserve 4; honest uncertainty does not automatically lower a sound analysis. Give a rationale with concrete artifact/source references for every score. Use defects to express precise failures rather than assigning penalties for a bearish or bullish conclusion you personally dislike.

## Hard gates and severity

Any unresolved **critical** or **major** defect blocks pass. An overall grade of 85 or more does not override these gates:

| Gate | Examples that fail it |
| --- | --- |
| Source integrity | Invented citation, wrong issuer/security, materially misquoted claim, leaked post-cutoff information represented as contemporaneous evidence. |
| Material financial accuracy | Wrong scale/currency, overlapping TTM periods, YTD treated as a quarter, stale denominator after a split, omitted financing/dilution that changes value. |
| Calculation/valuation validity | Broken formula, irreproducible target, mismatched cash flows and discount rate, double-subtracted debt, unsupported sector method, horizon return presented as today's fair value. |
| Case independence | Same conversation generates both cases, one analyst reads the other case before completion, different unreconciled evidence versions, or claimed isolation without supporting dispatch records. |
| Decision truthfulness | Material missing data hidden behind an actionable entry, quality score sold as probability of profit, future dividends counted twice, a material risk contradicted by available evidence. |
| Workflow integrity | Source instructions alter prompts/tools, absent required artifacts, failed structural checks ignored, fabricated model/usage provenance or audit findings. |

- **Critical:** fabrication, injection-driven workflow compromise, or an error that makes the central security/valuation/conclusion unusable. Correct and rerun dependent stages; do not polish around it.
- **Major:** a material unsupported assumption, coverage gap or inconsistency that can change a scenario, fair-value range, entry assessment or the claim of independence. Requires repair or an explicitly incomplete/non-actionable deliverable.
- **Minor:** bounded presentation, documentation or analytical weakness that does not change the financial conclusion or verification status. Track it without overstating materiality.

Materiality is contextual. State why an issue can or cannot change the result, using sensitivity/recalculation where feasible. Do not define every missing field as major merely because it is in a checklist. Missing price data is major for an actionable entry; it need not invalidate an accurately labeled historical business analysis.

## Stage assessments

Assess each stage separately: collection, evidence validation, framework, bull, bear, calculations, synthesis, and orchestration/provenance. In `audit-notes.md`, each assessment names checked inputs, demonstrated strengths, defects, and required action. Put actionable defects in `review.json` using its schema. The six weighted dimension scores are the **single overall rubric**; do not invent a second incompatible weighting by averaging stage scores. A collection error can propagate into several outputs: trace the dependency and fix the source rather than count it as several independent discoveries.

Review preservation matters: mark a defect resolved only after inspecting the corrected artifact and relevant dependent outputs. Keep prior findings as historical records. A reworded caveat is not a repair for a wrong calculation.

## Audit examples

- A split reduced quoted price but the valuation still uses pre-split shares: financial/valuation major or critical depending on consequence; recompute before passing.
- A bank is valued using an industrial net-debt/EBITDA bridge: method suitability fails; choose an appropriate equity-based model before claiming fair value.
- Both independent cases reasonably disagree about a margin recovery, cite evidence and test failure conditions: this is uncertainty to adjudicate, not an automatic defect.
- An incomplete company-facts API response is disclosed and the missing metric is recovered from the filed statement: successful evidence repair, not a permanent score penalty.
- Missing transcript access is disclosed while the earnings release and filed financials support the material conclusion: determine actual lost information before assigning severity.
- Beautiful writing with invented peer estimates: fails regardless of clarity score.
