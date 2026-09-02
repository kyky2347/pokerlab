# Observed local benchmarks

Run on 2026-09-02 using:

- macOS 26.5.2, ARM64
- CPython 3.12.13
- PokerLab Python reference engine
- command: `cd apps/api && uv run python -m pokerlab_api.benchmarks`

| Benchmark | Operations | Wall time | Throughput |
|---|---:|---:|---:|
| Seven-card evaluations | 10,000 | 0.448081 s | 22,317.39/s |
| Exact flop scenarios (990 runouts each) | 3 | 0.273938 s | 10.9514/s |
| Monte Carlo samples | 10,000 | 0.946920 s | 10,560.55/s |
| One-class river range-vs-range | 1 | 0.006851 s | 145.9703/s |
| CFR iterations, one-class ranges | 500 | 14.664462 s | 34.0960/s |

These are observations, not promises. The CFR rate depends strongly on blocker-compatible range-pair count and game-tree branching. Rust acceleration applies to terminal hand evaluation; orchestration and CFR remain Python in this release.
