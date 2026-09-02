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

## Range equity / 范围胜率

For weighted ranges $R_H,R_V$, an ordered combo pair $(h,v)$ is included only if

$$
h \cap v = \varnothing, \quad h \cap B = \varnothing, \quad v \cap B = \varnothing.
$$

Its chance mass is proportional to $w_h w_v$. This is why a hand class, a physical combo, and a weighted combo are distinct units. Impossible blocker collisions never enter the denominator.
