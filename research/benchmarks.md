# Observed local benchmarks

Run on 2026-09-02 using:

- macOS 26.5.2, ARM64
- CPython 3.12.13
- PokerLab Python reference engine
- command: `cd apps/api && uv run python -m pokerlab_api.benchmarks`

| Benchmark                               | Operations |   Wall time |  Throughput |
| --------------------------------------- | ---------: | ----------: | ----------: |
| Seven-card evaluations                  |     10,000 |  0.448081 s | 22,317.39/s |
| Exact flop scenarios (990 runouts each) |          3 |  0.273938 s |   10.9514/s |
| Monte Carlo samples                     |     10,000 |  0.946920 s | 10,560.55/s |
| One-class river range-vs-range          |          1 |  0.006851 s |  145.9703/s |
| CFR iterations, one-class ranges        |        500 | 14.664462 s |   34.0960/s |

These are observations, not promises. The CFR rate depends strongly on blocker-compatible range-pair count and game-tree branching. Rust acceleration applies to terminal hand evaluation; orchestration and CFR remain Python in this release.

以上是实测观察，而非性能承诺。CFR 速度强烈依赖合法范围组合对的数量及博弈树分支；Rust 加速终局牌力评估，调度与 CFR 仍由 Python 执行。

## CFR information-set allocation / CFR 信息集分配 — 2026-10-16

Environment: macOS 26.5.2 ARM64, CPython 3.12.13. Compare lazy node creation
with the eager `_cfr` traversals frozen from `d8d4e15`. All other helpers,
validation, showdown caching, evaluators and result generation use current code;
this is an allocation-policy comparison, not two complete historical builds.
Kuhn enumerates all six deals for 5,000 iterations. River uses board
`Ah Kd 7s 3c 2d`, `AQo: 1` versus `KQo: 1`, pot/stack 100, bets 0.5/1 pot,
61 legal deals and 500 iterations. Neither full-deal algorithm needs a seed.

环境为 macOS 26.5.2 ARM64、CPython 3.12.13；对照按需构造与从 `d8d4e15`
冻结的原 `_cfr` 遍历。其余辅助函数、校验、摊牌缓存、评估器与结果生成均使用
当前代码；这是分配策略对照，不是两个完整历史版本对照。Kuhn 穷举六组手牌对，
训练 5,000 轮；河牌公共牌为 `Ah Kd 7s 3c 2d`，范围 `AQo: 1` 对 `KQo: 1`，
底池/筹码 100，下注为 0.5/1 倍底池，61 组合法手牌对、500 轮。两者完整枚举，
不需要随机种子。

Each variant has one instrumented warmup to count actual node constructions,
then five uninstrumented timed runs with alternating order. Every run creates
a fresh solver. Timing includes construction, range expansion, training and
result generation, but excludes state comparison, HTTP, database and rendering.
All non-runtime outputs and every node's insertion/action order, cumulative
regrets, strategy sums and averages must match exactly; a mismatch fails the
command. Output checksums supplement this complete comparison, not replace it.

每种实现先预热一次并统计真实节点构造次数，再以交替顺序执行五次无计数包装器的
计时。每次创建新求解器；计时包含构造、范围展开、训练及结果生成，不含状态核对、
HTTP、数据库或渲染。全部非耗时输出及每个节点的插入/动作顺序、累计遗憾、策略
和与平均策略必须精确一致，否则命令失败。输出摘要只是完整比较的补充。

| Workload / 场景 | Eager constructions / 原构造数 | Lazy constructions / 新构造数 | Eager median / 原中位数 | Lazy median / 新中位数 | Ratio / 比率 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Kuhn, 5,000 iterations / 轮 | 120,000 | 12 | 127.75 ms | 103.36 ms | 1.24× |
| River, Python evaluator / 河牌 Python 评估器 | 183,000 | 54 | 496.74 ms | 466.08 ms | 1.07× |
| River, Rust evaluator / 河牌 Rust 评估器 | 183,000 | 54 | 496.30 ms | 467.13 ms | 1.06× |

[Raw measurements / 原始实测](cfr-allocations-2026-10-16.json) include every
individual timing, environment, input, count, checksum and complete public
result. Python always runs; Rust appears only if normal engine selection can
load it. Kuhn has no Hold'em evaluator; river CFR orchestration remains Python
for both evaluators. Existing automatic fallback is unchanged.

原始记录包含逐次耗时、环境、输入、计数、摘要与完整公开结果。Python 始终测试，
Rust 仅在正常引擎选择能够加载时加入；Kuhn 不使用德州扑克评估器，河牌 CFR
调度在两种评估器下均为 Python。现有自动回退不变。

```bash
cd apps/api
uv run python -m pokerlab_api.cfr_allocation_benchmark
```

The structural reduction removes temporary nodes and two arrays per redundant
construction; it does **not** reduce retained node count, prove a peak-memory
reduction, improve convergence, or strengthen the finite solver's guarantees.
Wall-clock gains vary with workload/hardware/load. The roughly 6% river gain
is separate from prior showdown-cache gains; do not multiply historical ratios.
See [CFR mathematics](../docs/math/cfr.md) and [solver limits](../docs/solver-limitations.md).

确定减少的是临时节点及每次冗余构造的两组数组，**不是**常驻节点数量，也不能据此
宣称内存峰值下降、收敛改善或有限求解器保证增强。耗时收益随场景、硬件和负载变化。
河牌约 6% 的耗时改善独立于此前摊牌缓存优化，不能把历史比率直接相乘。

## Weighted range sampling / 加权范围采样 — 2026-09-18

On macOS 26.5.2 ARM64, CPython 3.12.13, three sequential runs per engine. The workload is identical before and after optimization: 20 hand classes per player, board `2c 7d 9h`, seed `7`, 5,000 samples, 12,270 blocker-compatible pairs. Wall time includes expansion, sampling, terminal evaluation, and result statistics. No API, network, or database overhead is included.

环境为 macOS 26.5.2 ARM64、CPython 3.12.13，每个引擎连续运行三次。优化前后使用完全相同的工作负载：每人 20 类手牌，公共牌 `2c 7d 9h`，种子 `7`，5,000 次采样，12,270 个合法组合对。计时包含范围展开、采样、终局评估与结果统计，不含 API、网络或数据库开销。

| Engine / 引擎    | Before median / 优化前中位数 | After median / 优化后中位数 | Ratio / 加速比 |
| ---------------- | ---------------------------: | --------------------------: | -------------: |
| Python reference |                  1,217.35 ms |                   504.95 ms |          2.41× |
| Rust accelerated |                    822.49 ms |                   120.30 ms |          6.84× |

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

## Exact conditional turn map / 精确条件转牌地图 — 2026-09-22

Environment: macOS 26.5.2 ARM64, CPython 3.12.13. Fixed hands `As Ks` versus
`Qh Qd`, flop `Js 8s 2c`. Compare the original independent-per-turn algorithm
(45 × 44 = 1,980 showdowns) with shared unordered runouts (990 showdowns).
Both algorithms use the **same current evaluator and strict state validation**;
this is an algorithm comparison, not an old-commit versus new-commit timing.
Each has one warmup followed by five timed runs, alternating execution order.
Every run must match all 45 card/equity rows exactly or the command fails.

环境为 macOS 26.5.2 ARM64、CPython 3.12.13；固定手牌 `As Ks` 对 `Qh Qd`，翻牌 `Js 8s 2c`。对照原逐张转牌独立枚举算法（45 × 44 = 1,980 次摊牌）与复用无序补牌算法（990 次摊牌）。两者使用**相同的当前评估器及严格状态校验**，并非旧提交与新提交的直接计时。各预热一次，然后交替执行顺序测量五次；每次完整核对全部 45 行牌/胜率，不一致时命令报错。

| Engine / 引擎    | Independent turns median / 独立枚举中位数 | Shared runouts median / 复用补牌中位数 | Ratio / 加速比 |
| ---------------- | ----------------------------------------: | -------------------------------------: | -------------: |
| Python reference |                                 204.28 ms |                              103.51 ms |          1.97× |
| Rust accelerated |                                  40.93 ms |                               20.31 ms |          2.01× |

Individual runs in milliseconds / 各次耗时（毫秒）：

- Python independent / 独立枚举: `194.598, 204.281, 204.021, 205.028, 205.491`; shared / 复用补牌: `97.413, 97.998, 108.948, 105.661, 103.507`.
- Rust independent / 独立枚举: `40.822, 40.973, 40.926, 40.643, 41.091`; shared / 复用补牌: `20.099, 20.326, 20.313, 20.174, 20.509`.

```bash
cd apps/api
uv run python -m pokerlab_api.benchmarks --turn-map-only
```

The command emits full inputs, environment, engine names, timings, operation
counts, and all conditional equities. No seed is needed for exhaustive enumeration.
Python always runs; Rust is included only if normal engine selection succeeds.
Timing excludes HTTP, persistence, and browser rendering. The twofold reduction
in showdown calls is structural; wall-clock ratios vary with hardware and load.
It does not describe Monte Carlo, range sampling, CFR, or whole-app performance.
The mathematical identity and limitations are documented in [equity.md](../docs/math/equity.md).

命令输出完整输入、环境、引擎名称、耗时、评估次数和全部条件胜率；穷举无需随机种子。Python 始终执行，Rust 仅在正常引擎选择成功时加入。计时不包含 HTTP、持久化或浏览器渲染。摊牌调用减半是算法上的确定变化，实际耗时比仍受硬件与负载影响，不代表蒙特卡洛、范围采样、CFR 或整个应用性能。数学等价关系与使用限制详见上述文档。

## River solver showdown reuse / 河牌求解摊牌复用 — 2026-09-23

Environment: macOS 26.5.2 ARM64, CPython 3.12.13. Board `Ah Kd 7s 3c 2d`,
OOP range `AQo: 1`, IP range `KQo: 1`, pot 100, effective stack 100, bet sizes
0.5 and 1.0 pot, 100 iterations, 61 blocker-compatible deals. The baseline
subclass uses the original uncached evaluator call at every showdown terminal;
all other traversal, validation, regret updates, and result code are shared.
This compares caching behavior with the current evaluator, not separate commits.

环境为 macOS 26.5.2 ARM64、CPython 3.12.13。公共牌 `Ah Kd 7s 3c 2d`，OOP 范围 `AQo: 1`，IP 范围 `KQo: 1`，底池 100、有效筹码 100，下注大小为 0.5 和 1.0 倍底池，迭代 100 轮，共 61 组符合阻断关系的手牌对。基线子类在每个摊牌终局使用原来的未缓存评估调用；其余遍历、校验、遗憾更新和结果代码相同。这是在当前评估器上的缓存行为对照，并非两个提交之间的直接计时。

Each algorithm has one warmup job, then three timed jobs with alternating
execution order. Every run creates a fresh solver: no prewarmed showdown cache
or trained strategy carries over. Timings include construction, range expansion,
all iterations, and result generation, but exclude HTTP, database writes, and UI
rendering. The counting wrapper is used on both sides. Every non-runtime output,
including the full strategy matrix and convergence trace, must match exactly.

每种算法预热一个任务，再交替执行顺序测量三个任务。每次创建全新求解器，不复用已预热的摊牌缓存或训练策略。计时包含构造、范围展开、所有迭代和结果生成，不含 HTTP、数据库写入或界面渲染。两侧均使用相同的评估计数包装器；包括完整策略矩阵与收敛轨迹在内的全部非耗时输出必须完全一致。

| Engine / 引擎    | Uncached median / 未缓存中位数 | Cached median / 缓存中位数 | Ratio / 加速比 |
| ---------------- | -----------------------------: | -------------------------: | -------------: |
| Python reference |                    3,269.67 ms |                  112.71 ms |         29.01× |
| Rust accelerated |                      742.74 ms |                  103.32 ms |          7.19× |

Individual times in milliseconds / 各次耗时（毫秒）：

- Python uncached / 未缓存: `3270.283, 3269.672, 3255.236`; cached / 缓存: `109.613, 112.865, 112.708`.
- Rust uncached / 未缓存: `739.724, 742.739, 758.279`; cached / 缓存: `103.319, 105.813, 102.702`.

Every run measured **30,500 → 61 evaluator calls**. Cached lookup still happens
at each of the five showdown terminals, and the full game tree is traversed on
every iteration. The cache adds $O(D)$ memory for $D$ deals. These measurements
do not establish performance for larger ranges or other modules, and do not
improve the mathematical abstraction or certify exploitability.

每次实测评估器调用均由 **30,500 次减至 61 次**。五个摊牌终局仍各自查询缓存，每轮仍完整遍历博弈树。缓存为 $D$ 组手牌对增加 $O(D)$ 内存。这些数据不代表更大范围或其他模块的性能，也不意味着博弈抽象更精确或已严格计算 exploitability。

```bash
cd apps/api
uv run python -m pokerlab_api.benchmarks --solver-only
```

The command prints complete inputs, actual engine names, individual timings,
evaluation counts, and matching results. Python always runs; Rust runs only if
normal engine selection succeeds. Full-deal CFR is deterministic and uses no
random seed. See [CFR math](../docs/math/cfr.md) and [runtime limits](../docs/solver-limitations.md).

命令输出完整输入、实际引擎、逐次耗时、评估次数和核对后的结果。Python 始终执行，Rust 仅在正常引擎选择成功时加入。全手牌枚举 CFR 为确定性计算，不使用随机种子。数学依据及运行限制详见上述链接。

## Rust evaluator hot path / Rust 评估器高频路径 — 2026-10-03

Environment: macOS 26.5.2 ARM64, CPython 3.12.13, Rust 1.98.0. The baseline
is the extension built from `b3adcda`; the candidate is the fixed-array/bitmask
implementation. Both were freshly compiled in release mode with the **same
compiler and package configuration**, then loaded side by side. This is a
same-process native-extension comparison, not Python versus Rust. CI and
production containers separately verify compatibility with the pinned Rust 1.88.

环境为 macOS 26.5.2 ARM64、CPython 3.12.13、Rust 1.98.0。基线扩展来自
`b3adcda`，候选为固定数组/位掩码实现；两者均使用**相同编译器与包配置**重新
以 release 模式编译，再在同一进程并排加载。这是原生扩展优化前后对照，不是
Python 对 Rust 的比较。CI 和生产容器另使用固定的 Rust 1.88 验证兼容性。

The batch contains 5,000 varied seven-card hands sampled with seed `20251003`
from the canonical rank-major `cdhs` deck. The other workloads use `As Ks`
versus `Qh Qd` on `Js 8s 2c`: 990 exact runouts, 10,000 Monte Carlo samples
with the same seed, or all 45 conditional turns. Card-token preparation is
outside the batch timing; each native call still parses and validates its input.
Engine workloads include validation, orchestration and result generation.
HTTP, persistence, browser rendering, and reference comparisons are excluded.

批量场景从按点数、`cdhs` 花色排序的标准牌堆，以种子 `20251003` 抽取
5,000 组不同七张牌输入。其他场景为 `As Ks` 对 `Qh Qd`、翻牌 `Js 8s 2c`：
990 次精确补牌、同种子的 10,000 次蒙特卡洛，或全部 45 张条件转牌。批量计时
不含牌面字符串准备，但每次原生调用仍解析和校验输入；引擎场景包含校验、调度与
结果生成。不包含 HTTP、持久化、浏览器渲染及参考结果对比。

Each variant warms up once, followed by five timed runs in alternating order.
Every complete output must match the independent Python reference: all rank
vectors, probabilities, moments, interval metadata, convergence points and turn
rows, excluding only runtime and engine labels. A mismatch aborts the command;
the output checksum is for auditing, not a substitute for the full comparison.

每种实现先预热一次，再交替顺序计时五次。每次完整输出都必须与独立 Python
参考实现一致，包括全部牌力向量、概率、统计量、区间元数据、收敛点与转牌行，
仅排除耗时和引擎标签。不一致时命令立即失败；输出摘要用于审计，不代替完整比较。

| Workload / 场景                           | Baseline median / 基线中位数 | Optimized median / 优化中位数 | Ratio / 加速比 |
| ----------------------------------------- | ---------------------------: | ----------------------------: | -------------: |
| 5,000 seven-card evaluations / 七张牌评估 |                     42.64 ms |                       9.79 ms |          4.35× |
| Exact flop, 990 runouts / 精确翻牌        |                     17.95 ms |                       4.05 ms |          4.43× |
| 10,000 Monte Carlo samples / 蒙特卡洛     |                    189.31 ms |                      50.47 ms |          3.75× |
| Full conditional turn map / 完整转牌地图  |                     18.31 ms |                       4.38 ms |          4.18× |

Individual milliseconds, rounded to six decimals / 各次毫秒数，保留六位小数：

- Seven-card baseline: `42.635208, 42.794417, 42.462459, 42.589084, 42.940916`; optimized: `9.568666, 9.793167, 9.960958, 9.658000, 9.994500`.
- Exact baseline: `17.880416, 17.854542, 17.994375, 17.952583, 18.035500`; optimized: `4.025875, 4.068958, 4.053291, 3.966000, 4.190000`.
- Monte Carlo baseline: `189.608584, 188.691833, 190.431917, 189.305292, 189.098167`; optimized: `50.471125, 50.627042, 49.427791, 50.802792, 49.812042`.
- Turn-map baseline: `18.504750, 18.349792, 18.086083, 18.310000, 17.988416`; optimized: `4.377000, 4.411500, 4.095417, 4.427792, 4.328542`.

The baseline extension SHA-256 is
`7f13bcbf77b723b81fecbf3069391488c247eb053d161c6f428a1c0f6a81c8ee`.
The validated output SHA-256 values, in table order, are:

上述基线二进制与核对结果的 SHA-256 如下；结果顺序与表格一致：

```text
959abb59f2a25a49f7e1697ba6b374b0c3f3bad33aff51a573aaf05433833125
f4d0e45351d95ec04e59ae52484a480d94bd93ee1a18afaad436e62fa00f3f9e
c4d857b53193fdf5661182562611fe21583309dc76932e11b4ac857c095d295c
a380958587a22f046ed7a8de45b4eb7c99ad29c3e7ebea5dc4fe772701dc2b09
```

Run the current implementation, always checking against Python / 运行当前实现并核对 Python：

```bash
cd apps/api
uv sync --frozen --reinstall-package poker-core-rs
uv run python -m pokerlab_api.evaluator_benchmark
```

For a paired comparison, build `b3adcda` in a separate checkout with the same
Python ABI, architecture, Rust toolchain and release flags. Find its native
extension path with `uv run python -c 'import poker_core_rs; print(poker_core_rs.poker_core_rs.__file__)'`.
Pass that **trusted native binary** to the current checkout's command:

双版本对照时，在独立检出目录构建 `b3adcda`，使用相同 Python ABI、架构、Rust
工具链及 release 参数。上述命令可显示其原生扩展路径，再将这个**可信本地二进制**
传给当前检出目录中的命令：

```bash
uv run python -m pokerlab_api.evaluator_benchmark \
  --baseline-extension /absolute/path/to/baseline/poker_core_rs.cpython-312-darwin.so
```

The default command reports current timings without inventing a speedup. The
optional path loads native code, so never use untrusted binaries. The benchmark
requires a working Rust extension and reports a failure if it cannot load one;
the application's automatic Python fallback remains unchanged. Absolute timing
and ratios depend on workload, toolchain, hardware and load. These measurements
do not establish speedups for full-deck ranges, CFR, HTTP endpoints or the UI.

默认命令只报告当前耗时，不虚构加速比。可选路径会加载原生代码，切勿使用不可信
二进制。基准必须有可加载的 Rust 扩展，否则明确失败；应用自身的自动 Python
回退不变。耗时和比率取决于工作负载、工具链、硬件与负载，不代表完整范围、CFR、
HTTP 接口或界面的加速效果。

## Compact range-pair preparation / 紧凑范围组合对准备 — 2026-10-06

Environment: macOS 26.5.2 ARM64, CPython 3.12.13. Compare the original
set-filtered list of `(hero, villain, weight)` objects with the current card-mask
and compact-array implementation. Both prepare the complete ordered pair table,
sum its mass, and build cumulative sampling weights. This is a same-process
algorithm comparison, not two complete releases. No showdown evaluator runs.

环境为 macOS 26.5.2 ARM64、CPython 3.12.13。对照原来的集合筛选与
`(hero, villain, weight)` 对象列表，以及当前牌面掩码/紧凑数组实现。
两侧均准备完整有序组合表、权重总和及采样累计表；这是同进程算法对照，
不是两个完整版本的对照，也不调用摊牌评估器。

Each variant warms up once; every decoded pair, weight product, cumulative
entry, count, and mass must match exactly. Five timed runs then alternate
execution order, checking count/mass on each run. A separate fresh `tracemalloc`
run per variant measures peak Python allocations; tracing is **off during timing**.
Previous tables are released and garbage-collected before each measurement.
Combos are expanded before timing/tracing. There is no randomness in preparing
these complete tables, so this benchmark has no seed. Seeded draw/runout parity
is separately covered by the regression suite.

每种实现先预热一次，逐项核对解码后的手牌对、权重乘积、累计权重、数量及
总质量。随后交替执行顺序计时五次，每次复核数量与总质量。每种实现另做一次
独立的 `tracemalloc` 分配峰值测量，**计时期间不启用内存跟踪**。每次测量前
释放并回收前一份表。范围展开位于计时/跟踪之外；完整表准备不含随机过程，
因此此基准无需种子。固定种子的抽样/补牌一致性由独立回归测试覆盖。

Workloads / 工作负载：

- **20-class flop:** `AA KK QQ JJ TT 99 88 77 AKs AQs AJs ATs KQs KJs QJs JTs AKo AQo AJo KQo`, in that order for both players, weights cycling through `0.25, 0.5, 0.75, 1`; board `2c 7d 9h`. 122 combos per player, 12,270 pairs, mass 4,750. / 双方按上述顺序与循环权重输入，翻牌如上；每人 122 个组合，共 12,270 对，总质量 4,750。
- **169-class preflop:** all hand classes with weight 1, ordered by first appearance in canonical deck pair enumeration; no board. 1,326 combos per player, 1,624,350 pairs, mass 1,624,350. / 全部类别权重为 1，按标准牌堆双牌枚举首次出现顺序输入，无公共牌；每人 1,326 个组合，共 1,624,350 对，总质量相同。

| Workload / 场景                  | Legacy median / 原实现中位数 | Compact median / 紧凑实现中位数 | Legacy allocation peak / 原分配峰值 | Compact allocation peak / 紧凑分配峰值 |
| -------------------------------- | ---------------------------: | ------------------------------: | ----------------------------------: | -------------------------------------: |
| 20-class flop / 20 类翻牌        |                     5.177 ms |                        1.225 ms |                     1,590,672 bytes |                          258,456 bytes |
| 169-class preflop / 169 类翻牌前 |                   809.857 ms |                      158.657 ms |                   208,994,640 bytes |                       33,231,696 bytes |

For the full-range workload, these peaks are **199.31 → 31.69 MiB**, an
**84.1% reduction**; median preparation time is **5.10× faster** on this machine.
Individual times in milliseconds / 完整范围峰值减少 **84.1%**，本机准备阶段
耗时中位数加速 **5.10 倍**；各次耗时（毫秒）：

- 20-class legacy / 原实现: `5.481, 5.153, 5.177, 4.989, 5.277`.
- 20-class compact / 紧凑实现: `1.227, 1.291, 1.225, 1.173, 1.225`.
- 169-class legacy / 原实现: `823.930, 815.790, 799.114, 806.669, 809.857`.
- 169-class compact / 紧凑实现: `159.724, 160.082, 157.387, 155.962, 158.657`.

```bash
cd apps/api
uv run python -m pokerlab_api.range_pair_benchmark
```

The command emits full ordered range inputs, environment, raw measurements,
and verification results. `--repeats` changes timing repetitions. These are
Python allocation peaks, **not total process RSS**, and exclude range expansion,
showdown evaluation, HTTP, database work, native memory, and browser rendering.
Preparation remains $O(P)$ in time and space; this does not establish a whole-app
speedup, a CFR improvement, or constant-memory sampling. Ratios vary by hardware
and load. The exact/Monte Carlo threshold and selected-engine fallback are unchanged.

命令输出完整有序范围输入、环境、原始测量与验证结果；`--repeats` 可调整计时
重复次数。这是 Python 分配峰值，**不是进程 RSS**，不包含范围展开、摊牌评估、
HTTP、数据库、原生内存和浏览器渲染。准备时间与空间仍为 $O(P)$，不代表整个
应用或 CFR 加速，也不是常量内存采样；比率随硬件与负载变化。精确/蒙特卡洛
阈值与引擎自动回退不变。

## Fixed-hand Monte Carlo showdown reuse / 固定手牌蒙特卡洛摊牌复用 — 2026-10-14

Environment: macOS 26.5.2 ARM64, CPython 3.12.13. Fixed hands `As Ks` versus
`Qh Qd`, 10,000 samples, seed `7`. Boards are empty (preflop control), `Js 8s 2c`
(flop), `Js 8s 2c 3d` (turn), and `Js 8s 2c 3d 4h` (river). The baseline is the
uncached loop frozen from `26720ac`; both variants use the **same current
showdown evaluator**. This compares orchestration algorithms, not separate
releases or Python against Rust.

环境为 macOS 26.5.2 ARM64、CPython 3.12.13。固定手牌 `As Ks` 对 `Qh Qd`，
10,000 个样本，种子 `7`。公共牌依次为：空（翻牌前对照）、`Js 8s 2c`（翻牌）、
`Js 8s 2c 3d`（转牌）、`Js 8s 2c 3d 4h`（河牌）。基线为从 `26720ac` 冻结的
原无缓存循环；两种算法使用**相同的当前摊牌评估器**。这是调度算法对照，
不是两个完整版本之间或 Python 对 Rust 的比较。

Each variant has one counted warmup, followed by three **uninstrumented** timed
runs in alternating order. Evaluation counters are removed during timing. Every
call starts with a fresh request-local cache, including timed calls after warmup.
Every non-runtime result must exactly match the original loop: probabilities,
sample count, seed, moments, confidence metadata/bounds, engine label, and all
convergence checkpoints. A mismatch aborts the benchmark. Timing includes state
validation, sampling, evaluation, aggregation and result construction; it excludes
engine initialization, output comparison, HTTP, database writes and the UI.

每种算法先预热一次并统计评估次数，再交替顺序进行三次**不含计数包装器**的
计时。每次调用都使用全新的请求缓存，预热不会替后续调用填充缓存。每次必须
完整匹配原循环除耗时外的所有结果，包括概率、样本数、种子、统计量、置信区间
元数据/边界、引擎名称及全部收敛检查点；不一致则立即失败。计时包含状态校验、
抽样、评估、累加及结果构造，不含引擎初始化、结果对比、HTTP、数据库或界面。

| Engine / 引擎    | Board / 阶段             | Uncached median / 原中位数 | Cached-path median / 新中位数 | Ratio / 加速比 | Measured evaluator calls / 实测评估次数 |
| ---------------- | ------------------------ | -------------------------: | ----------------------------: | -------------: | --------------------------------------: |
| Python reference | Preflop control / 翻牌前 |                1000.419 ms |                    995.027 ms |              — |                         10,000 → 10,000 |
| Python reference | Flop / 翻牌              |                 973.226 ms |                    104.764 ms |          9.29× |                            10,000 → 990 |
| Python reference | Turn / 转牌              |                 953.499 ms |                     10.541 ms |         90.45× |                             10,000 → 44 |
| Python reference | River / 河牌             |                 958.380 ms |                      4.605 ms |        208.12× |                              10,000 → 1 |
| Rust accelerated | Preflop control / 翻牌前 |                  66.695 ms |                     63.403 ms |              — |                         10,000 → 10,000 |
| Rust accelerated | Flop / 翻牌              |                  49.067 ms |                     12.887 ms |          3.81× |                            10,000 → 990 |
| Rust accelerated | Turn / 转牌              |                  45.684 ms |                      6.576 ms |          6.95× |                             10,000 → 44 |
| Rust accelerated | River / 河牌             |                  44.570 ms |                      4.541 ms |          9.82× |                              10,000 → 1 |

All individual timings, inputs, environment, actual engine names, measured call
counts and complete-output SHA-256 checksums are retained in the
[raw JSON record](monte-carlo-2026-10-14.json). The checksum includes the engine
label, so matching mathematical results on different engines have different
checksums. It complements, rather than replaces, the complete output comparison.

全部逐次计时、输入、环境、实际引擎名称、评估次数和完整输出 SHA-256 都保留在
上述原始 JSON 中。摘要包括引擎标签，因此不同引擎即使数学结果相同，摘要仍不同；
摘要用于审计，不能代替完整结果对比。

```bash
cd apps/api
uv run python -m pokerlab_api.monte_carlo_benchmark --repeats 3 --samples 10000 --seed 7
```

The Python reference always runs. Rust is included only when normal engine
selection succeeds, and a fallback is never labeled Rust. Preflop is intentionally
uncached: its small timing difference is a control observation, **not a claimed
optimization**. Reuse saves repeated deterministic evaluations, not random draws
or statistical samples. Cache bounds are 990/44/1 entries after flop/turn/river;
sampling still takes O(n) work. The benefit depends on repetition rate, sample
count, evaluator, hardware and load; low-sample workloads may see little benefit
or lookup overhead. These measurements do not establish speedups for weighted
ranges, CFR, exact enumeration or the whole application. See the
[invariants and limitations](../docs/math/monte-carlo.md#request-local-showdown-reuse--单次请求内的摊牌复用).

Python 参考引擎始终执行，Rust 仅在正常选择流程成功时加入；回退不会被标为 Rust。
翻牌前故意不缓存，微小计时差只是对照观察，**不宣称为优化收益**。复用省去的是
重复确定性评估，不是随机抽牌或统计样本。翻牌/转牌/河牌缓存上限为 990/44/1 项，
抽样仍需 O(n) 工作量。收益取决于重复率、样本数、评估器、硬件和负载；低样本数
场景可能收益很小或仅增加查找开销。本记录不代表加权范围、CFR、精确枚举或整站
性能，数学不变量与限制见上述链接。
