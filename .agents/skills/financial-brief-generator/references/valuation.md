# Valuation and entry judgment

## Choose a method the business can support

| Business/evidence | Primary approach | Cross-check and failure modes |
| --- | --- | --- |
| Established operating company with estimable cash flows | FCFF discounted at WACC, or FCFE at cost of equity | Comparable multiples on matched periods and accounting definitions; avoid switching cash-flow claims and discount rates. |
| Bank or insurer | Equity cash flow/dividend capacity or excess-return model tied to capital needs | P/E and price-to-book with profitability, asset quality, reserve and regulatory-capital context. Ordinary EV/EBITDA and industrial net-debt bridges can be inappropriate. |
| Cyclical/commodity business | Mid-cycle operating economics with a balance-sheet stress case | Peak earnings multiples can appear cheap; establish a normalized cycle and sensitivity to volume, price, costs and leverage. |
| REIT/asset-heavy operator | Relevant cash generation and NAV/property or asset valuation | Reconcile FFO/AFFO or other adjusted metrics to accounts; account for maintenance capex, leverage, lease terms and dilution. |
| Loss-making growth company | Explicit path to cash generation, reinvestment and funding needs | Revenue multiples are conditional on attainable economics, not sufficient standalone fair value. Include dilution, cash runway and a failure case. |
| Binary or distressed company | Explicit event/recovery scenarios where evidence supports them | Large uncertainty may preclude a reliable fair-value or entry range. Do not force a steady-state DCF. |

Use the implemented calculator's supported methods. If the appropriate sector method is absent, record an unsupported-method gap and do not substitute an economically wrong model to obtain a number. A documented, reproducible calculation can be added and tested as a separate workflow implementation task.

The cash-flow claimant and discount rate must agree; enterprise and equity approaches are not interchangeable. [NYU Stern valuation framework](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/lectures/val.html) Financial businesses also require explicit capital reinvestment assumptions. [NYU Stern financial-firm value drivers](https://pages.stern.nyu.edu/adamodar/New_Home_Page/littlebook/bankvaluedriver.htm)

## Required economic bridges

- **Operations to cash:** revenue/segment drivers → margins → taxes → operating earnings → depreciation/noncash items → capex and working capital → cash available to the relevant capital providers. State why growth, margins and reinvestment can coexist. Historical cash flow is not automatically sustainable cash flow.
- **Enterprise to common equity:** reconcile cash that is truly excess, debt and other senior claims, noncontrolling interests, nonoperating assets and share count. Keep lease treatment consistent with operating metrics and peer enterprise values. Do not subtract debt again from an equity-based valuation.
- **Dilution and distributions:** model stock compensation, options, convertible treatment and repurchases consistently. Do not both expense the same economic dilution and charge it again without reconciliation. Do not count repurchases as a shareholder cash dividend while also increasing per-share value from the reduced denominator.
- **Discounting:** state valuation date, cash-flow timing, nominal/real and currency basis, rate inputs and rationale. A 12-month investment horizon does not justify truncating the business's economic life to one year. Terminal growth must be consistent with steady-state reinvestment and less than the applicable discount rate.
- **Peers:** explain business/segment mix, profitability, growth, capital intensity, risk and accounting comparability. Match trailing/forward periods and definitions. Do not combine today's peer multiple with an inconsistent target fiscal period.

## Scenarios and sensitivity

Each bear/base/bull scenario should have internally consistent revenue, profitability, cash conversion, reinvestment, financing/dilution and valuation assumptions, with reasons for the differences. Vary the few drivers that dominate the outcome. Do not create three targets by applying arbitrary percentages to one target.

Compute the current-price expectations test: what growth/margin/return on capital or multiple does the current price require? Use a supported reverse-valuation calculation or an explicit reproducible sensitivity grid; state any nonunique solution. Compare implied assumptions with history, capacity, market size, peer economics and execution evidence.

Show sensitivities to material operating assumptions and valuation inputs, including discount rate and terminal growth when using a perpetuity. Quantify the share of value from terminal assumptions and discuss reliance on it. Investigate economically implausible outputs and whether a point estimate overstates confidence.

The discounted-model calculator requires `sensitivity.discountRates` and `sensitivity.terminalGrowths` as attributed driver assumptions and retains the rate/growth grid. Every point must have growth below the discount rate and return on capital/equity. Use the bear/base/bull driver differences for material operating sensitivities; add separately saved, explicitly changed inputs and calculated results for a targeted operating stress. Supported expectations tool: `reverse-pe --input ... --out ...`; this solves earnings implied by a chosen multiple and return hurdle, not a general reverse DCF or measured consensus.

Subjective scenario weights are optional, must sum to one if used, and need reasons. Report their sensitivity. A weighted result is an assumption-dependent expectation, not a statistically established price target. Do not fit weights to obtain a desired verdict.

## Separate three outputs

1. **Fair value today:** present value under stated assumptions and methods, with a credible range and sensitivity.
2. **Horizon price scenarios:** expected equity values at the stated future date, using financials, valuation and share count consistent with that date. Distinguish price return from total return including cash distributions; use a clear dividend timing convention. Do not simply relabel today's DCF as a future price.
3. **Entry conditions:** the maximum price satisfying a stated required return and/or margin of safety, assessed against bear-case loss and evidence needed before entry. Required return and risk tolerance are user inputs or explicitly labeled analyst assumptions, never hidden personal suitability judgments.

For a simple horizon total-return threshold with cash distributions treated as paid at horizon, `entry ceiling = (horizon price + horizon distributions) / (1 + annual required return)^(months/12)`. If dividend timing matters, discount each dated payment. A present-value margin-of-safety criterion applies to **today's** value, not to an undiscounted horizon target. Display how those assumptions affect the ceiling; a lower bound need not be invented to make a neat range.

Combine valuation with balance-sheet survivability, upcoming catalysts and price context. A large drawdown does not override deteriorating fundamentals. An attractive discount without a credible horizon catalyst may warrant a watch condition. Distinguish insufficient evidence from a negative investment judgment.
