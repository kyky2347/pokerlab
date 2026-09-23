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

PokerLab caches only $s(d)$, evaluated by the selected Rust or Python engine,
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

## Kuhn fixture / Kuhn 验证

The implementation first solves canonical three-card Kuhn Poker by enumerating all six ordered deals. Its estimated player-zero value must approach the known value $-1/18$ and every information-set strategy must normalize to one before the Hold'em solver is accepted.

收敛曲线只能说明有限抽象内的遗憾与平均策略变化正在减小；它不能证明完整无限注德州扑克的 GTO，也不报告未经严格计算的 exploitability。
