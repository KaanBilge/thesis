"""Render the README figure from the preserved AVGO calculator output.

Optional documentation dependency: Python 3.10+ and matplotlib.
Run from any directory: python scripts/plot-avgo-sensitivity.py
No research, network access, or model calls are made.
"""

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap, Normalize


def main():
    root = Path(__file__).resolve().parents[1]
    source = root / "examples/avgo/valuation.json"
    data = json.loads(source.read_text(encoding="utf-8"))
    base = next(s for s in data["scenarios"] if s["name"] == "base")
    points = base["fairValue"]["terminalGrowthSensitivity"]
    rates = sorted({p["discountRate"] for p in points})
    growths = sorted({p["terminalGrowth"] for p in points}, reverse=True)
    cells = {(p["discountRate"], p["terminalGrowth"]): p["perShareValue"] for p in points}
    assert len(cells) == len(points) == len(rates) * len(growths), "Expected a complete, unique grid"
    values = [[cells[(rate, growth)] for rate in rates] for growth in growths]

    navy, muted = "#203653", "#53667e"
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 13, "text.color": navy})
    fig = plt.figure(figsize=(12, 6.8), facecolor="#ffffff")
    fig.text(0.08, 0.915, "AVGO / What changes the valuation?", fontsize=24, weight="bold")
    fig.text(0.08, 0.862, "Base-case FCFF DCF · September 16, 2026 · USD per share", fontsize=13, color=muted)
    ax = fig.add_axes([0.19, 0.25, 0.73, 0.48])
    cmap = LinearSegmentedColormap.from_list("thesis", ["#f0f4fa", "#b5c9e3", "#294f85"])
    norm = Normalize(min(cells.values()), max(cells.values()))
    ax.imshow(values, cmap=cmap, norm=norm, aspect="auto")
    ax.set_xticks(range(len(rates)), [f"{r * 100:g}%" for r in rates])
    ax.set_yticks(range(len(growths)), [f"{g * 100:g}%" for g in growths])
    ax.set_xlabel("Discount rate (WACC)", labelpad=12, fontsize=13, color=navy)
    ax.set_ylabel("Terminal growth", labelpad=15, fontsize=13, color=navy)
    ax.tick_params(axis="both", length=0, pad=12, colors=navy, labelsize=14)
    for row, growth in enumerate(growths):
        for column, rate in enumerate(rates):
            value = cells[(rate, growth)]
            ax.text(column, row, f"${value:,.0f}", ha="center", va="center", fontsize=24,
                    weight="bold", color="white" if norm(value) > 0.65 else navy)
    for x in range(1, len(rates)):
        ax.axvline(x - 0.5, color="white", linewidth=3)
    for y in range(1, len(growths)):
        ax.axhline(y - 0.5, color="white", linewidth=3)
    for spine in ax.spines.values():
        spine.set_visible(False)
    fig.text(0.08, 0.09, "Operating forecasts held fixed; terminal income and reinvestment recomputed at each growth rate.",
             fontsize=11, color=muted)
    fig.text(0.08, 0.048, "Source: examples/avgo/valuation.json · Conditional model values, not a probability distribution.",
             fontsize=10, color=muted)
    target = root / "docs/images/avgo-sensitivity.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(target, dpi=180, facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"Rendered {target.name}: {len(points)} saved grid points")


if __name__ == "__main__":
    main()
