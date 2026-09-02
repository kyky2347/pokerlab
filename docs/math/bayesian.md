# Beta–Binomial opponent model / Beta–Binomial 对手模型

Let an opponent's unknown aggression probability be

$$
p \sim \operatorname{Beta}(\alpha,\beta),
\qquad
f(p)=\frac{p^{\alpha-1}(1-p)^{\beta-1}}{B(\alpha,\beta)}.
$$

After observing $s$ aggressive actions and $f$ non-aggressive opportunities, conjugacy gives

$$
p\mid\text{data}\sim\operatorname{Beta}(\alpha+s,\beta+f).
$$

The posterior mean is

$$
\mathbb E[p\mid\text{data}]
=\frac{\alpha+s}{\alpha+\beta+s+f}.
$$

PokerLab computes equal-tailed credible intervals from the Beta quantile function and plots both densities. 少量观察只会更新分布，不会把不确定性压缩成一个“确定读牌”。该模型把机会视为条件独立且参数稳定，这在真实对局中只是有意简化的教学假设。
