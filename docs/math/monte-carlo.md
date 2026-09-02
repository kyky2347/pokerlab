# Monte Carlo estimation / 蒙特卡洛估计

Each independently sampled legal runout produces

\[
X_i \in \{0,\tfrac12,1\},
\qquad
\widehat E_n = \frac{1}{n}\sum_{i=1}^n X_i.
\]

The unbiased sample variance and standard error are

\[
s^2 = \frac{1}{n-1}\sum_{i=1}^n (X_i-\widehat E_n)^2,
\qquad
\operatorname{SE}(\widehat E_n)=\frac{s}{\sqrt n}.
\]

PokerLab displays the normal-approximation interval

\[
\left[\widehat E_n-1.96\operatorname{SE},\;
\widehat E_n+1.96\operatorname{SE}\right]\cap[0,1].
\]

每个随机 API 都接受整数种子。相同参数与种子会生成相同的样本序列、估计值和收敛轨迹。区间是频率学派的重复抽样区间，不应解释为“真实胜率有 95% 概率位于其中”。

The convergence chart records real running means and intervals at deterministic checkpoints. A narrowing band illustrates the (O(n^{-1/2})) standard-error rate; it does not guarantee a particular finite-sample error.
