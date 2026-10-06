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
