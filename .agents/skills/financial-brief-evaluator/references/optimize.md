# Quality-first optimization protocol

## Baseline before cost experiments

Establish the generator's Astra baseline using the current model, high or greater reasoning, prompt versions, tools and fixed rubric. Do not begin by replacing analysts or graders with a cheaper model. First identify and repair failures in financial reasoning, judgment, source coverage and calculations. Record model-level failures separately from retrieval/tool defects.

Store experiments outside active run artifacts. Every experiment needs an ID, hypothesis, baseline/candidate identifiers, exact prompt/tool diffs, evaluation cases/split, frozen evidence versions, model/reasoning configurations, measured outcomes and adoption decision. Preserve the original baseline and all failed candidates.

## Evaluation set

Build a diverse set: profitable compounder, highly valued growth company, bank/insurer, cyclical, leveraged business, loss-making/dilutive company, and a case where reliable valuation should be withheld. Include difficult data fixtures: restatement, split/ADR conversion, YTD cash-flow reconciliation, stale quote, conflicting disclosures, inaccessible transcript, adverse news, misleading peer multiple, unsupported valuation method and injected source instructions.

Use separate categories of evaluation:

- **Deterministic tools:** known-result financial and date/corporate-action fixtures, invalid-input tests and provider failure behavior.
- **Reasoning with frozen evidence:** paired baseline/candidate runs using identical source artifacts, dates and company selection.
- **Research completeness:** controlled cases in which the collector must find relevant documents; assess against a curated source set without giving it the expected answer.
- **Prospective investment tracking:** store dated forecasts, scenarios and conditions before outcomes occur; later assess calibration and total return against the stated market/sector benchmark. This is separate from a writing-quality audit.

Split development and held-out cases before tuning. Keep final held-out cases and their expected failure modes out of optimization prompts. Historical research evaluations must enforce information availability and economic-data vintages; latest restated filings or revised macro data cannot silently be backfilled into a past cutoff. Report survivorship, selection and regime limitations.

## Bounded experiment loop

1. Inspect failed/high-effort runs and select a concrete hypothesis: for example, a missing financial reconciliation, leading framework language, weak peer justification, or an irrelevant document consuming context.
2. Change a coherent small set of prompts, tools or sequencing decisions. Keep the rubric fixed. Start with at most **three candidate configurations** in a batch and at least **two independent runs per case/configuration** to expose model variability. These counts are a bounded starting design, not proof of statistical reliability.
3. Evaluate paired runs with fresh Astra judges that do not know baseline/candidate labels, costs or expected winner. Randomize presentation order and repeat reversed-order comparisons where side-by-side judgments are used. Grade each run against the fixed rubric before pairwise preference. Do not reward verbosity. Spot-check grades against human-reviewed examples and deterministic facts; record disagreement.
4. Compare per-dimension scores, overall distribution, hard-gate failures, worst cases and case-specific financial defects. Report run count and uncertainty. Do not declare superiority from one attractive example, a tiny average gain or a model judge's unsupported preference.
5. Test the chosen candidate on held-out cases once the change is finalized. If it fails, record the failure and use a new held-out set for a subsequently tuned claim; do not repeatedly train on the same supposedly unseen set.
6. Adopt only changes supported by the quality evidence and preserve a rollback configuration. Otherwise retain the baseline and the experiment findings. An inconclusive result is a reason for more targeted evidence or retaining the baseline, not claiming improvement.

Stop after the batch budget or when the hypothesis has been answered. Record the next experiment separately. Never let the evaluator continually rewrite the prompts of the research run it is currently grading.

## Quality floor for later efficiency experiments

Report total and per-stage/model token usage where the runtime exposes it, including failed attempts, correction rounds and evaluation. Distinguish input, output and cached tokens when available. Measure tool calls, retrieval payload size, latency and retries separately. If usage is unavailable, leave it unknown; a byte/word estimate is only a labeled proxy. Do not infer token prices or cost savings from model names without a verified price schedule.

Efficiency candidates may include caching identical source retrievals, removing duplicate documents, targeted section extraction, deterministic calculations, compact source-linked financial tables, and rerunning only invalidated stages. Compression must preserve decisive counterevidence and uncertainty. Validate it by checking whether analysts can still answer the material financial questions and locate support.

Only after the Astra baseline meets the high-quality gates may an explicit cost experiment test lower-cost models or reasoning levels. Predeclare a non-inferiority margin and critical-case requirements before running it; use no relaxed hard gates, no newly accepted critical/major defects, no score below 85 or dimension below 3 on passing release cases, and no material deterioration in financial judgment. Until evidence supports a different margin, allow **no observed quality-score decrease on held-out release cases**. Small samples cannot prove unchanged quality; retain Astra when uncertainty is material.

An optimization report should state: demonstrated quality change, worst-case findings, measured usage/latency change, uncertain or unavailable measurements, exact candidate changes, and adopt/reject/need-more-evidence with reasons. Never summarize success only as “fewer tokens.”
