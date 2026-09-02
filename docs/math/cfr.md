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

## Kuhn fixture / Kuhn 验证

The implementation first solves canonical three-card Kuhn Poker by enumerating all six ordered deals. Its estimated player-zero value must approach the known value $-1/18$ and every information-set strategy must normalize to one before the Hold'em solver is accepted.

收敛曲线只能说明有限抽象内的遗憾与平均策略变化正在减小；它不能证明完整无限注德州扑克的 GTO，也不报告未经严格计算的 exploitability。
