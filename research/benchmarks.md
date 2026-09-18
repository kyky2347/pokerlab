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

以上是实测观察，而非性能承诺。CFR 速度强烈依赖合法范围组合对的数量及博弈树分支；Rust 加速终局牌力评估，调度与 CFR 仍由 Python 执行。

## Weighted range sampling / 加权范围采样 — 2026-09-18

On macOS 26.5.2 ARM64, CPython 3.12.13, three sequential runs per engine. The workload is identical before and after optimization: 20 hand classes per player, board `2c 7d 9h`, seed `7`, 5,000 samples, 12,270 blocker-compatible pairs. Wall time includes expansion, sampling, terminal evaluation, and result statistics. No API, network, or database overhead is included.

环境为 macOS 26.5.2 ARM64、CPython 3.12.13，每个引擎连续运行三次。优化前后使用完全相同的工作负载：每人 20 类手牌，公共牌 `2c 7d 9h`，种子 `7`，5,000 次采样，12,270 个合法组合对。计时包含范围展开、采样、终局评估与结果统计，不含 API、网络或数据库开销。

| Engine / 引擎 | Before median / 优化前中位数 | After median / 优化后中位数 | Ratio / 加速比 |
| --- | ---: | ---: | ---: |
| Python reference | 1,217.35 ms | 504.95 ms | 2.41× |
| Rust accelerated | 822.49 ms | 120.30 ms | 6.84× |

Individual runs in milliseconds / 各次耗时（毫秒）：

- Python before / 优化前: `1217.346, 1208.844, 1218.050`; after / 优化后: `504.946, 510.799, 500.848`.
- Rust before / 优化前: `831.732, 809.339, 822.490`; after / 优化后: `116.935, 120.302, 120.977`.

Baseline: `8af7fc1`, using the same inputs and loop now exposed by the command below. All runs returned hero equity `0.5001`, win `0.4694`, tie `0.0614`, loss `0.4692`, and pair mass `5853.62`. Regression tests compare every drawn pair and board, not just the final equity, against the original sampler across three seeds and preflop/flop/turn boards.

基线为 `8af7fc1`，输入与计时循环和下方新增命令相同。所有运行均得到 hero equity `0.5001`、赢 `0.4694`、平 `0.0614`、输 `0.4692`、组合对权重总和 `5853.62`。回归测试在三个种子与翻牌前/翻牌/转牌场景下逐次核对原采样器的手牌对与公共牌，而不只比较最终胜率。

```bash
cd apps/api
uv run python -m pokerlab_api.benchmarks --range-only
```

The command prints complete inputs, individual timings, actual selected engine names, and results. Python always runs; Rust runs only when the normal engine-selection path can load it. Pair selection changes from rebuilding an O(P) cumulative table on every sample to one O(P) setup plus O(log P) draws. Pair enumeration still uses O(P) memory, so full-deck ranges remain more demanding than this workload. Exact enumeration and CFR performance are not represented by these ratios.

命令输出完整输入、逐次耗时、实际引擎名称及结果。Python 始终运行；只有正常引擎选择流程能加载 Rust 时才测试加速路径。组合对选择由每次采样重建 O(P) 累计表，改为一次 O(P) 初始化与每次 O(log P) 抽样。组合对枚举仍使用 O(P) 内存，因此完整范围比本场景更耗资源。这些加速比不代表精确枚举或 CFR 的性能变化。
