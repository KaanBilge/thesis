# AVGO: preserved research example

This example contains unchanged copies from `reports/AVGO/20260916T214341Z/`, with a research cutoff of **September 16, 2026, 21:43:41 UTC** and a twelve-month horizon. It illustrates the research and calculation workflow at that historical cutoff. It is not current investment guidance.

[Back to Thesis](../../README.md) · [Critical assessment of this run](../../docs/avgo-first-run-assessment.md)

| File | What to inspect |
| --- | --- |
| [report.md](report.md) | Conclusions, competing cases, scenarios, catalysts and limitations. |
| [research-record.md](research-record.md) | Source references, financial drivers, calculations, dispatch provenance and original audit notes. |
| [valuation-input.json](valuation-input.json) | Explicit observed/assumed drivers, source availability, forecasts and valuation methods. |
| [valuation.json](valuation.json) | Deterministic scenario outputs and sensitivity grids. |
| [SHA256SUMS.json](SHA256SUMS.json) | Exact-byte hashes of these four preserved files. |

The original saved review scored 87.5/100 with two open minor findings. The later assessment identifies material limitations in market expectations and method selection. The saved grade is a research-quality judgment, not forecast accuracy or a probability of investment success. The original documents retain their contemporaneous wording, including the author's pre-audit caveats; this copy does not revise their findings. Local Git attributes disable line-ending conversion for the four preserved artifacts so their byte hashes remain stable across operating systems.

## Replay the valuation

From the repository root, after `npm install`:

```bash
npm run analyst -- calculate --input examples/avgo/valuation-input.json --out .qa/avgo-recomputed.json
```

This command makes no network or model calls. It recomputes values under the recorded assumptions and does not recheck sources or renew the original audit. `.qa/` is ignored by Git and is created if needed.

Compare the parsed output to the preserved result:

```bash
node -e "const fs = require('node:fs'); const assert = require('node:assert/strict'); const read = p => JSON.parse(fs.readFileSync(p, 'utf8')); assert.deepStrictEqual(read('.qa/avgo-recomputed.json'), read('examples/avgo/valuation.json')); console.log('Replay matches the preserved output.');"
```

## Regenerate the sensitivity figure

The figure reads the saved base-case `terminalGrowthSensitivity` grid. Each cell is a conditional USD/share value; it does not represent a probability. The operating forecast stays fixed while the calculator recomputes terminal income and reinvestment for the selected growth rate.

Optional documentation dependencies: Python 3.10+ and Matplotlib.

```bash
python -m pip install matplotlib
python scripts/plot-avgo-sensitivity.py
```

The script writes [the README figure](../../docs/images/avgo-sensitivity.png). It does not alter the financial artifacts.

## What this package includes

This is a selected publication and calculation example, not the complete run directory. The research record names source snapshots and intermediate artifacts that are retained in the original local run and are not all distributed here. Original provider responses, local session logs and the personal SQLite library are excluded. The screenshots show that original local run; they are not an automatically seeded demo library.

The preserved record includes generic worker identifiers such as `/root/bull` as research provenance. These identify agent roles, not local filesystem locations. The model attribution is retained from the original run.

Do not use this partial package as a complete bundle for `analyst audit`, `analyst render`, or the guarded audited-import path. Replaying the calculator only needs the included inputs; a new audit requires the complete reviewed artifacts and evidence. [Publication requirements](../../docs/analyst.md#evaluation-and-publication)
