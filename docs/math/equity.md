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

## Range equity / 范围胜率

For weighted ranges $R_H,R_V$, an ordered combo pair $(h,v)$ is included only if

$$
h \cap v = \varnothing, \quad h \cap B = \varnothing, \quad v \cap B = \varnothing.
$$

Its chance mass is proportional to $w_h w_v$. This is why a hand class, a physical combo, and a weighted combo are distinct units. Impossible blocker collisions never enter the denominator.

每组合法手牌对的概率质量与双方权重乘积 $w_h w_v$ 成正比。因此，手牌类别、物理组合与加权组合是不同单位；不可能的阻断冲突不会进入分母。

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
