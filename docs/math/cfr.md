# Counterfactual Regret Minimization / 反事实遗憾最小化

For information set $I$, action $a$, and iteration $t$, instantaneous counterfactual regret is

$$
r_t(I,a)=v_i(\sigma_{I\to a}^t,I)-v_i(\sigma^t,I).
$$

CFR accumulates $R_T(I,a)=\sum_{t=1}^T r_t(I,a)$. Regret matching chooses

$$
\sigma_{T+1}(I,a)=
\begin{cases}
\dfrac{R_T^+(I,a)}{\sum_b R_T^+(I,b)}, & \sum_b R_T^+(I,b)>0,\\
\dfrac1{|A(I)|}, & \text{otherwise.}
\end{cases}
$$

where $R^+=\max(R,0)$. PokerLab's river implementation uses the CFR+ update that clips cumulative regrets at zero. Average strategy weights each visited strategy by the acting player's reach probability and the blocker-aware private-card chance mass.

## Reach probabilities / 到达概率

Player $i$'s reach probability is the product of that player's own action probabilities along the history. Regret updates are weighted by the opponent reach probability; average-strategy updates use the acting player's reach probability. Chance reach is the normalized product of the two range-combo weights.

## Fixed-board showdown reuse / 固定河牌的摊牌复用

For a fixed legal private-card pair $d$ and river board, the showdown share
$s(d)\in\{0,\tfrac12,1\}$ does not depend on betting history or iteration.
Check/check utility is $(2s(d)-1)P/2$; a called bet of size $b$ has utility
$(2s(d)-1)(P/2+b)$ for OOP. Fold utilities do not require a showdown.

For terminal evaluation, PokerLab caches only $s(d)$, evaluated by the selected Rust or Python engine,
inside that solver instance. It does not cache or approximate regrets, reach
probabilities, strategies, or utilities with different bet sizes. The current
tree has five showdown terminals, so $D$ legal deals over $T$ iterations now
require $D$ evaluator calls instead of $5DT$. The tree is still fully traversed;
memory increases by $O(D)$ and there is no cross-job cache.

在固定河牌和合法双方手牌对 $d$ 下，摊牌份额 $s(d)$ 与下注历史及迭代次数无关。双方过牌时 OOP 收益为 $(2s(d)-1)P/2$，大小为 $b$ 的下注被跟注时为 $(2s(d)-1)(P/2+b)$；弃牌终局无需评估牌力。求解器只在当前实例中缓存真实引擎计算的 $s(d)$，不缓存或近似遗憾、到达概率、策略，也不把不同下注金额的收益混用。当前树有五个摊牌终局，$D$ 组合法手牌对、$T$ 轮迭代的评估次数由 $5DT$ 降为 $D$；整棵树仍完整遍历，额外内存为 $O(D)$，缓存不跨任务共享。

Regression tests compare the full strategy and every convergence checkpoint
against uncached traversal, including weighted ranges and split pots, with both
engines. Invalid evaluator outputs are rejected rather than propagated into a
strategy. Zero representable chance mass is rejected before normalization.

回归测试在双引擎下对照未缓存版本的完整策略及每个收敛检查点，覆盖加权范围与平局。非法评估结果不会进入策略计算；范围权重乘积下溢而使总质量为零时，在归一化之前拒绝该输入。

## Information-set allocation / 信息集分配

Each solver creates an information-set node only on its first visit. Subsequent
visits reuse that node's existing regret and strategy arrays; they still compute
the current strategy and update every value in the original order. Python's
eager `setdefault(key, InformationSet(...))` previously constructed and discarded
a fresh node even when the key already existed. Avoiding that default evaluation
does not skip any deal, branch, iteration, or arithmetic operation.

每个求解器只在首次访问时创建信息集节点。后续访问复用已有的遗憾与策略数组，
仍重新计算当前策略，并按原顺序更新全部数值。此前的 `setdefault` 默认值表达式
会在键已存在时仍创建并丢弃新节点；移除这一重复构造不跳过任何手牌对、分支、
迭代或数学运算。

Kuhn has 24 nonterminal visits per iteration and 12 distinct information sets;
the river tree has six nonterminal visits per deal per iteration. Construction
count is now the number of distinct visited information sets, rather than the
number of visits. This allocation change preserves retained state and asymptotic memory; only
temporary object/array churn is removed. No nodes or mutable arrays are shared
across solver jobs. Continuing an existing solver retains its prior training.

Kuhn 每轮访问 24 个非终局节点，只有 12 个不同的信息集；河牌树每组手牌对每轮
有六次非终局访问。构造次数现在等于访问过的不同信息集数量，而不是总访问次数。
这一分配优化保持常驻状态与渐近内存复杂度不变，只消除临时对象和数组的反复分配。不同求解任务
不共享节点或可变数组；同一求解器继续训练时保留此前的累计状态。

Tests compare full outputs, node insertion/action order, cumulative regrets,
strategy sums and averages with the original eager traversals, including weighted
ranges, stack-capped bets, split pots, both engines and continued training.
The [reproducible benchmark](../../research/benchmarks.md#cfr-information-set-allocation--cfr-信息集分配--2026-10-16)
checks the same complete state before reporting any timing.

测试对照原来的重复构造遍历，逐项核对完整输出、节点插入/动作顺序、累计遗憾、
策略和与平均策略，覆盖加权范围、筹码上限、平局、双引擎及连续训练。
可复现基准也在报告耗时前核对相同的完整状态。

## River node lookup / 河牌节点查找

Each river solver also keeps a job-local lookup from `(actor, own cards, public
history)` to the existing information-set node. Its canonical text key is built
on first access, preserving insertion order and the public result format.
Opponent cards and chance weights are excluded from the lookup identity: deals
that are indistinguishable to the acting player must still update the same node.
Seats and histories remain separate, even when the private cards are identical.

每个河牌求解器还保存任务内的 `(行动者、自身手牌、公开历史)` 到已有信息集节点
的查找表。规范文本键仅在首次访问时构造，保留插入顺序与公开结果格式。查找身份
不包含对手手牌或机会权重：行动者无法区分的发牌仍必须更新同一节点；不同座位和
公开历史保持分离，即使自身手牌相同。

The lookup holds node references, not cached strategies or regret values. Every
visit recomputes the current strategy and performs the original arithmetic in
the original order. Generated deals add one lookup entry per visited information
set; continuing training does not grow it with iterations. This **adds O(I)
memory** for I information sets. It is not a memory-saving optimization, a new
solver algorithm, or a stronger convergence guarantee. Instances share no nodes.

查找表保存节点引用，不缓存策略或遗憾数值。每次访问仍重新计算当前策略，并按
原顺序执行数学运算。正常生成的发牌每个已访问信息集增加一个查找条目，继续训练
不会随轮数增加条目。这会为 I 个信息集**增加 O(I) 内存**，不是节省内存、新求解
算法或更强收敛保证；不同实例不共享节点。

Regression tests compare complete results, all node arrays and insertion/action
order with the pre-lookup traversal, including continued training, weighted
ranges, capped bets, split pots, both engines and reversed private-card order.
The [benchmark and raw evidence](../../research/benchmarks.md#river-node-lookup--河牌节点查找--2026-10-27)
include a single-iteration control and refuse to report any mismatched result.

回归逐项对照优化前遍历的完整结果、全部节点数组与插入/动作顺序，覆盖连续训练、
加权范围、筹码上限、平局、双引擎和手牌顺序反转。基准包含单轮对照，遇到任何
结果差异即中止，不报告该次性能结果。

## Kuhn fixture / Kuhn 验证

The implementation first solves canonical three-card Kuhn Poker by enumerating all six ordered deals. Its estimated player-zero value must approach the known value $-1/18$ and every information-set strategy must normalize to one before the Hold'em solver is accepted.

The API runs the public **20,000-iteration** fixture once during each worker's
startup, before serving requests. `/solver/kuhn-verification` and the
`kuhn_verification` field of `/diagnostics` return the same complete result,
not a hard-coded success or a fresh training run.
The diagnostics fixture previously used 5,000 iterations; its numerical values
now match the solver page. The solver endpoint's result shape and 20,000-iteration
calculation are unchanged. No experiment or solver-job records are created.

API 在每个工作进程启动、接收请求之前运行一次 **20,000 轮**公开验证样例。
`/solver/kuhn-verification` 与 `/diagnostics` 的 `kuhn_verification` 字段返回
同一份完整结果，不是硬编码的成功状态，也不是每次读取都重新训练。诊断自检此前
为 5,000 轮，现在数值与求解器页面一致；求解器接口的结果结构与 20,000 轮计算
保持不变，不写入实验或求解任务记录。

The additional startup work replaces repeated request-time computation. The
snapshot is process-local, bounded to one fixture, and recomputed on restart;
multiple workers each compute their own. A failed numerical check is returned
unchanged, and a calculation exception aborts startup rather than substituting an
old result. Reading this snapshot does not exercise the solver again or certify
subsequent river jobs. `/diagnostics` still checks the database on every request.

新增启动计算取代请求阶段的重复计算。快照仅属于当前进程、只保留一份固定样例，
每次重启重新计算，多工作进程各自计算。数值检查失败会原样返回；计算抛出异常
会终止启动，而不是使用旧结果替代。读取快照不会再次执行求解器，也不为后续
河牌任务提供正确性认证；`/diagnostics` 仍会在每次请求时检查数据库。

收敛曲线只能说明有限抽象内的遗憾与平均策略变化正在减小；它不能证明完整无限注德州扑克的 GTO，也不报告未经严格计算的 exploitability。
