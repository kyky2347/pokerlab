# Expected value and pot odds / 期望值与底池赔率

PokerLab uses these input conventions:

- $P$: pot before the opponent bets;
- $B$: opponent bet already added to the pot;
- $C$: hero's call size;
- $e$: hero showdown equity after calling.

The final pot after the call is $F=P+B+C$. The break-even equity is

$$
e^*=\frac{C}{F}.
$$

Incremental call EV is

$$
\operatorname{EV}(\text{call}) = eF-C
=e(P+B)-(1-e)C.
$$

此前投入的筹码是沉没成本，不进入当前跟注的增量比较。若 EV(call) 为负，弃牌的增量 EV 约定为 0；这不是对整手牌历史盈利的评价。

Earlier contributions are sunk costs and are excluded from the incremental decision. Folding has incremental EV zero when compared with calling; this does not describe profit over the entire hand.

## Reading the chart / 阅读图表

The horizontal axis is continuous equity from 0% to 100%. The API supplies both the curve and the exact break-even threshold; the browser connects the supplied EV points with straight segments. A solid vertical marker shows hero equity and a dashed vertical marker shows break-even equity. They coincide when those values are equal. EV above the zero line is positive; EV below it is negative. The shading is neutral and does not encode the sign.

横轴是 0% 至 100% 的连续胜率。API 提供曲线及精确的盈亏平衡值，浏览器仅以直线连接返回的 EV 点。竖直实线表示英雄胜率，竖直虚线表示盈亏平衡胜率；两者相等时重合。零线上方为正 EV，下方为负 EV，背景填充不区分正负。

For example, with `P=105`, `B=C=50`, the final pot is `205` and break-even is `50/205 ≈ 24.3902439%`. At `30.5%` equity, incremental call EV is approximately `12.525` before display rounding. Neither marker needs to be one of the curve's 101 sampled equities. Labels round to two percentage decimals; marker positions use the unrounded values. Zero-cost calls have a 0% threshold, including the left endpoint.

例如 `P=105`、`B=C=50` 时，最终底池为 `205`，盈亏平衡胜率为 `50/205 ≈ 24.3902439%`。英雄胜率为 `30.5%` 时，增量跟注 EV 在显示舍入前约为 `12.525`。两条标记均无需落在曲线的 101 个采样胜率上；图例保留两位百分数小数，位置使用未舍入值。零成本跟注的盈亏平衡点为 0%，显示在左端点。
