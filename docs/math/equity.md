# Equity / 胜率

For a fixed legal Hold'em state, PokerLab defines hero equity as

$$
E = \Pr(\text{win}) + \frac{1}{2}\Pr(\text{tie}).
$$

对一个固定且合法的德州扑克牌面，英雄胜率定义为胜出概率加上平局概率的一半。

## Exact enumeration / 精确枚举

Let $D$ be the remaining deck and $k=5-|B|$ the number of missing board cards. The runout space has

$$
N = { |D| \choose k }
$$

states. PokerLab evaluates every unordered runout when $N \le 2{,}000{,}000$. Each seven-card hand is reduced to the maximum rank across its $\binom{7}{5}=21$ five-card subsets. The evaluator orders categories lexicographically from high card through straight flush and handles the wheel straight (A2345) explicitly.

当状态空间不超过安全上限时，系统枚举所有无序补牌，并使用自己的五/七张牌评估器完成摊牌；生产代码不依赖第三方牌力库。

## Native showdown bridge / 原生摊牌接口

The Rust extension exposes `showdown(hero, villain, board)` for two cards per
player and a completed five-card board. It parses nine card tokens once and
rejects duplicates across the whole deal before ranking both players' 21
five-card subsets. Complete rank vectors, including every kicker, are compared
inside Rust; the result is hero's **win 1 / tie 0.5 / loss 0**. The existing
`evaluate_seven` public entry point still validates its own seven cards.

Rust 扩展提供 `showdown(hero, villain, board)`，要求双方各两张手牌与完整五张
公共牌。九张牌仅解析一次，先拒绝整个牌局的重复牌，再为双方分别评估全部 21 个
五张牌子集。完整牌力向量（含全部踢脚牌）在 Rust 内比较，返回英雄的**赢 1／
平 0.5／输 0**。原有 `evaluate_seven` 公开入口仍独立校验七张牌。

`RustPokerEngine` retains the shared Python state validation, then makes one
native call instead of two and formats nine tokens instead of fourteen. It
validates the returned outcome before use. Sampling, aggregation, runout caches,
confidence intervals and CFR updates retain their existing order. This reduces
bridge overhead without reducing the evaluated poker states or rank comparisons.

`RustPokerEngine` 保留 Python 共享状态校验，将每次摊牌的原生调用从两次减至一次、
牌面字符串转换从十四次减至九次，并在使用前检查返回值。抽样、累加、补牌缓存、
置信区间与 CFR 更新顺序保持不变；减少的是跨语言调用开销，不减少评估的牌局状态
或牌力比较。

Startup verifies native wins, losses and ties when the function is available.
Failed loading or smoke checks still select `Python reference`. Older extensions
without this function continue using the two-call Rust path and report
`Rust accelerated`; they gain the optimization after a rebuild and API restart.
To rebuild a native checkout: `cd apps/api && uv sync --frozen --reinstall-package poker-core-rs`.
Container users rebuild with `./pokerlab`. Runtime evaluator failures remain errors
and do not switch engines partway through a calculation. See the
[measured benchmark](../../research/benchmarks.md#native-showdown-bridge--原生摊牌接口--2026-11-05).

新接口可用时，启动过程核对真实赢、输、平三种结果；加载或自检失败仍选择
`Python reference`。没有新接口的旧扩展继续使用两次调用的 Rust 路径，并如实显示
`Rust accelerated`；重新构建并重启 API 后才能获得此次优化。本地构建命令见上，
容器用户通过 `./pokerlab` 重建。运行中的评估器故障仍报错，不在计算中途换引擎。
实测与复现方式见上述基准记录。

## Conditional turn map / 条件转牌地图

For two fixed, known hands and a legal three-card flop $F$, exactly 45 cards remain.
Write $s(t,r)\in\{0,\frac12,1\}$ for hero's share at showdown on $F,t,r$. For each
possible turn $t$, all 44 legal rivers have equal probability:

$$
E_t = \frac{1}{44}\sum_{r\ne t}s(t,r).
$$

The final Hold'em board is unordered, so $s(t,r)=s(r,t)$. PokerLab evaluates each
of the $\binom{45}{2}=990$ unordered pairs once and credits the outcome to both
turn buckets. This replaces 1,980 repeated evaluations without sampling or
changing the denominator. Ties still count as half a pot. Output remains in
canonical deck order, excluding both players' cards and the flop.

对于双方固定且已知的手牌和合法三张翻牌，剩余牌堆有 45 张。给定一张转牌后，44 张合法河牌等概率出现；上式中的摊牌收益为输 0、平 1/2、赢 1。最终公共牌与转河牌顺序无关，因此只需评估 990 个无序组合，并把结果同时计入两张牌各自的转牌桶，取代原来的 1,980 次重复评估。这不是抽样近似，分母和平局权重保持不变，返回顺序仍为排除所有已知牌后的标准牌堆顺序。

As a consistency check, averaging all conditional turn equities must recover
the exact flop equity:

$$
\frac{1}{45}\sum_t E_t
=\frac{2}{45\cdot44}\sum_{\{t,r\}}s(t,r)
=E_F.
$$

回归测试核对每张转牌的独立精确枚举、上述全期望等式、双方交换后的互补性，以及 Python/Rust 一致性。该地图只描述固定手牌的摊牌胜率，不包含转牌下注策略、范围更新或策略求解。

Regression tests cover independent enumeration of every turn, this total-expectation
identity, player-swap symmetry, and Python/Rust agreement. The map describes only
showdown equity for fixed hands, not turn betting strategy, range updates, or a solver.

## Domain validation / 领域校验

Cards require an integer rank from 2 to 14 and one suit from `c/d/h/s`.
Both showdown engines require two cards per player, a five-card board, and
uniqueness across **all nine cards**, not just within each player's seven-card hand.
Invalid states fail before evaluation. Rust load or smoke-test failures still
select the Python reference engine, whose identity is exposed in API results.

牌对象必须使用 2–14 的整数点数和 `c/d/h/s` 中的单字符花色。两个摊牌引擎均要求每人两张手牌、五张公共牌，且全部九张牌互不重复，而非仅检查各人的七张牌。非法状态在评估前即被拒绝；Rust 无法加载或启动自检失败时仍自动回退至 Python，API 如实返回所用引擎名称。

### Evaluator output contract / 评估器输出契约

Every completed showdown must return a built-in Python `int` or `float` equal
to **0 (loss), 0.5 (tie), or 1 (win)**. Booleans, complex numbers, strings,
collections, `None`, NaN, infinities and other fractions are invalid. There is
no conversion, rounding or default-to-loss behavior. Fixed-hand counts, both
range-equity branches and river CFR use the same check before consuming an
outcome; request/job caches only receive validated outcomes.

每次完整摊牌必须返回 Python 内置 `int` 或 `float`，值严格为 **输 0、平 0.5、赢 1**。
布尔值、复数、字符串、集合、`None`、NaN、无穷及其他小数均非法；不进行转换、
四舍五入或默认判输。固定手牌计数、范围胜率的两条路径和河牌 CFR 在使用结果前
共享同一检查，请求/任务缓存只接收校验通过的结果。

A violation raises `InvalidShowdownOutcome`, an internal `RuntimeError`, not an
invalid-input `ValueError`. HTTP requests return the existing safe bilingual 500
with a request ID. No successful experiment or trainer question is stored from
that calculation. A solver whose running job was already committed follows the
normal failed-job path and releases its slot. Fix the evaluator before retrying;
runtime failures do not silently switch engines or reuse a partial solver state.
Startup Rust loading/smoke-test fallback remains unchanged.

违约时抛出内部运行错误 `InvalidShowdownOutcome`，而不是表示输入有误的 `ValueError`。
HTTP 请求沿用带编号的安全双语 500 响应，此次计算不保存成功实验或训练题目。
若求解器已提交运行中任务，则进入既有失败记录流程并释放并发名额。重试前需修复
评估器；运行时错误不静默切换引擎，也不复用部分求解状态。启动时的 Rust 加载/
自检失败自动回退保持不变。

Valid results retain their exact accumulation order, sampling draws, seeds,
tie weight and solver updates. Tests inject failures before and after valid
evaluations, check SQLite/PostgreSQL persistence and recovery, and retain the
independent enumeration, cross-engine, seeded-stream and complete-strategy
comparisons. This is an output-domain check: a wrong but admissible 0/0.5/1 still
requires the evaluator's mathematical tests to detect.

合法结果的累加顺序、抽样、种子、平局权重和求解更新不变。测试在首个及后续评估
注入故障，核对 SQLite/PostgreSQL 持久化与恢复，并保留独立枚举、双引擎、完整
随机序列和完整策略对照。这是输出值域检查；若评估器返回合法但算错的 0/0.5/1，
仍需由数学正确性测试识别。

## Range equity / 范围胜率

For weighted ranges $R_H,R_V$, an ordered combo pair $(h,v)$ is included only if

$$
h \cap v = \varnothing, \quad h \cap B = \varnothing, \quad v \cap B = \varnothing.
$$

Its chance mass is proportional to $w_h w_v$. This is why a hand class, a physical combo, and a weighted combo are distinct units. Impossible blocker collisions never enter the denominator.

每组合法手牌对的概率质量与双方权重乘积 $w_h w_v$ 成正比。因此，手牌类别、物理组合与加权组合是不同单位；不可能的阻断冲突不会进入分母。

### Range input contract / 范围输入契约

Each weight must be a finite JSON number in `[0, 1]`. Integers `0` and `1` and fractional numbers such as `0.25` are valid; `true`, `false`, `"0.5"`, null, arrays, objects, NaN and infinity are rejected. This applies to `/range/statistics`, both players in `/range/equity`, and both players in `/solver/jobs`. Invalid weights return HTTP 422 with the offending hand's field path and a request ID, before calculation, solver-slot acquisition or a durable experiment/job write. API documentation exposes the same numeric bounds.

每个权重必须为 `[0, 1]` 内的有限 JSON 数值。整数 `0`、`1` 和 `0.25` 等小数均合法；`true`、`false`、`"0.5"`、null、数组、对象、NaN 和无穷大都会被拒绝。此契约统一应用于 `/range/statistics`、`/range/equity` 双方范围及 `/solver/jobs` 双方范围。非法权重在计算、占用求解名额或写入实验/任务记录之前返回 HTTP 422，附具体手牌字段路径和请求 ID；API 文档同时列出数值上下界。

For example, `{"range":{"AA":1,"AKs":0.5,"22":0},"blocked":["As"]}` is a valid statistics request. Zero excludes a class. Statistics allow an empty range; equity and solver requests still require at least one positive weight per player. Canonical aliases such as `KAs` remain accepted, but supplying both `AKs` and `KAs` remains an error, including when one weight is zero. HTTP card inputs use two-character tokens and cannot repeat a physical card.

例如 `{"range":{"AA":1,"AKs":0.5,"22":0},"blocked":["As"]}` 是合法统计请求。权重为零表示排除该类别。统计接口允许空范围，胜率和求解接口仍要求双方至少各有一个正权重类别。`KAs` 等别名继续有效，但同时传入 `AKs` 和 `KAs` 仍会报错，即使其中一项权重为零。HTTP 牌面使用两字符记法，不可重复指定同一张物理牌。

Direct Python range functions accept built-in `int`/`float` weights under the same bounds. They do not coerce booleans, text, complex values or arbitrary numeric objects. Blockers must be distinct `Card` objects; a one-shot iterator is supported. Repeated blockers and raw strings such as `"As"` now raise `ValueError` rather than being silently deduplicated or ignored; parse tokens with `parse_cards` first. This stricter boundary intentionally rejects previously coerced inputs. For valid input, physical-combo ordering, weight values, exact results, seeded draw streams and solver strategies are unchanged.

直接调用 Python 范围函数时，权重必须使用相同边界内的内置 `int`/`float`，不自动转换布尔值、文本、复数或任意数值对象。阻断牌必须为不重复的 `Card` 对象，支持一次性迭代器。重复阻断牌或原始字符串 `"As"` 现在会抛出 `ValueError`，而不是被静默去重或忽略；字符串牌面应先经 `parse_cards` 解析。此次收紧明确拒绝旧版自动转换的输入；合法输入的物理组合顺序、权重、精确结果、固定种子抽样序列及求解策略保持不变。

### Compact pair storage / 紧凑组合对存储

Range expansion preserves input class order. Each physical combo receives a
52-bit occupancy mask, so a bitwise intersection identifies cross-player card
collisions. Legal pairs retain hero-major, villain-minor order and are encoded
as `hero_index * villain_combo_count + villain_index` in an unsigned 32-bit array.
At most 1,326 combos per player produce 1,624,350 legal ordered preflop pairs.
Double-precision arrays hold the original weight products and, for sampling,
their cumulative sums. This removes millions of retained Python tuples/floats;
it does **not** prune legal pairs or approximate the range distribution.

范围展开保留输入类别顺序。每个物理组合使用 52 位占用掩码，通过按位相交判断双方重复牌；合法组合对仍按英雄优先、对手其次的原顺序排列，并以上述公式编码至 32 位无符号数组。每人最多 1,326 个组合，翻牌前共有 1,624,350 个合法有序组合对。原始权重乘积和采样所需的累计权重使用双精度数组，减少常驻 Python 元组与浮点对象；这**不会**删减合法组合或近似范围分布。

If pair count times runout count is at most 250,000, all pair/runout states are
enumerated. Otherwise, seeded `random.choices` selects a pair using its cumulative
weight, then `random.sample` draws a legal runout without replacement. Pair order,
weight multiplication, accumulation order, RNG calls, and deck order are unchanged
from the object-based implementation. Reported pair mass still uses `sum`, not
the last cumulative value: those can differ in floating-point arithmetic.

组合对数乘以补牌数不超过 250,000 时，系统精确枚举全部状态；超过时，带种子的 `random.choices` 按累计权重抽取组合对，再用 `random.sample` 无放回抽取合法补牌。组合顺序、权重乘法、累加顺序、随机调用和牌堆顺序均保持不变。报告的权重总质量仍使用 `sum`，而非累计表末项，二者的浮点舍入可能不同。

The algorithm still requires $O(P)$ preparation time and memory for $P$ pairs;
it is not a constant-memory sampler. The selected Rust/Python showdown engine,
automatic fallback, and exact/Monte Carlo threshold are unchanged. Reproduction
and measurement boundaries are in [the benchmark record](../../research/benchmarks.md).

算法对 $P$ 个组合对仍需 $O(P)$ 准备时间和内存，不是常量内存采样器。实际 Rust/Python 摊牌引擎、自动回退与精确/蒙特卡洛切换阈值均不变。复现方式与测量边界见上述基准记录。
