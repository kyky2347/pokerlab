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
