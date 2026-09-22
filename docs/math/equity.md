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
