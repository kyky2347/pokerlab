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

PokerLab computes equal-tailed credible intervals from the Beta quantile functions. Observations update a distribution, not a certain opponent read. The model assumes conditionally independent opportunities and a stable aggression rate; these are deliberately simplified educational assumptions.

PokerLab 用 Beta 分位函数计算等尾可信区间。少量观察只会更新分布，不会把不确定性压缩成一个“确定读牌”。该模型把机会视为条件独立且参数稳定，这在真实对局中只是有意简化的教学假设。

## Probability-preserving display / 保留概率质量的展示

The research chart uses **200 equal-width bins across the complete [0, 1] support**. For bin $[l_i,r_i]$, the backend computes its probability mass and average density:

研究页使用覆盖完整 $[0,1]$ 支撑集的 **200 个等宽区间**。对每个区间，后端计算概率质量与平均密度：

$$
m_i=F(r_i)-F(l_i),\qquad
\bar f_i=\frac{m_i}{r_i-l_i}.
$$

In the upper tail, use $S(l_i)-S(r_i)$ with the survival function $S=1-F$, avoiding subtraction of CDF values already rounded to one. The API checks finite, nonnegative masses and total mass within $10^{-12}$ of one; it **does not renormalize a failed computation**. An unresolved numerical result returns a structured error and is not stored.

上尾使用生存函数差 $S(l_i)-S(r_i)$，避免两个已舍入到 1 的 CDF 值相减。API 检查概率有限、非负且总和与 1 的绝对误差不超过 $10^{-12}$；**不会对失败结果强行归一化**。数值计算不可靠时返回结构化错误，不保存实验。

The browser plots these API densities as steps on a numeric probability axis. The dashed prior and filled posterior remain distinguishable without relying solely on color. **Area is probability; height is density and can exceed one.** Each bin is 0.5 percentage points wide: bin probabilities are preserved to numerical tolerance, but within-bin peak shape is unresolved. Very small tails can underflow, and extreme quantiles can round to 0 or 1; neither means certainty.

浏览器仅将 API 密度绘为数值概率轴上的阶梯图。先验虚线与后验填充不只依赖颜色区分。**面积才是概率；高度是密度，可以大于 1。** 每格宽 0.5 个百分点：区间概率在数值容差内保留，但不能分辨格内的细峰。极小尾部可能下溢，极端分位值也可能舍入到 0 或 1；均不代表确定性。

The credible interval is **not inferred from the plot**. For $t=(1-c)/2$, its endpoints use `beta.ppf(t, a, b)` and `beta.isf(t, a, b)` independently. The upper endpoint avoids forming `1 - t`, which can round to one when the requested credible level is very close to one. The posterior parameters and mean retain the conjugate update above.

可信区间**不是从图上估算**。令 $t=(1-c)/2$，两端独立使用 `beta.ppf(t, a, b)` 与 `beta.isf(t, a, b)`；上端避免显式计算 `1 - t`，防止可信水平极接近 1 时将尾部舍入掉。后验参数与均值仍遵循上述共轭更新公式。

## API and historical records / API 与历史记录

New results include `distribution.method = "beta-cdf-bins-v1"`, domain, bin count, and 200 bins containing `left`, `right`, `prior_mass`, `posterior_mass`, `prior_density`, and `posterior_density`. JSON exports preserve these values and the numerical limitations. Prior parameters must be JSON numbers in $(0,1000]$; observed counts must be JSON integers from 0 through 100,000; $0.5<c<1$. Boolean values and numeric strings are not accepted, nor are fractional/floating-point count inputs.

新结果增加上述版本化 `distribution`、坐标范围、区间数和每格的边界、先验/后验概率及平均密度。JSON 导出保留这些值与数值限制。先验参数必须为 $(0,1000]$ 内的 JSON 数值，行为计数必须为 0 至 100,000 的 JSON 整数，且 $0.5<c<1$；不接受布尔值、数字字符串或浮点形式的计数。

The original `density` field retains its 120 pointwise PDF samples for compatibility, but is **deprecated for charting**: narrow or boundary-concentrated distributions can be almost entirely missed between samples. The research page uses the new bins, and shows a bilingual recovery message if versioned bin data is unavailable; it does not relabel legacy curves. Historical experiments remain unchanged and downloadable, with no database migration or retroactive recalculation.

原 `density` 字段保留 120 个 PDF 点采样以兼容旧调用方，但**不再推荐用于绘图**：点间窄峰或边界集中分布可能几乎完全遗漏。研究页使用新分箱；版本化数据不可用时显示双语恢复提示，不把旧曲线冒充新方法。历史实验保持原样并可下载，不迁移数据库或追溯重算。

## Validation / 验证

Tests independently check closed-form uniform, linear, and arcsine Beta CDFs; full-support mass/area; both boundary tails; concentrated posteriors; cancellation-resistant tiny upper tails; extreme credible levels; invalid inputs; and numerical fault injection. SQLite/PostgreSQL tests verify persistence and exact JSON round trips for new and old records. UI tests check numeric axes, step geometry, bilingual caveats, and rejection of unknown or malformed bin metadata.

测试使用均匀、线性与反正弦 Beta CDF 的闭式公式独立核对，覆盖完整概率/面积、两端边界、集中后验、微小上尾、极端可信水平、非法输入与数值故障注入。SQLite/PostgreSQL 验证新旧记录持久化及完整 JSON 导出；前端测试验证数值轴、阶梯几何、双语限制与未知/非法分箱数据拒绝。

References / 参考：[NIST Beta distribution](https://www.itl.nist.gov/div898/handbook/eda/section3/eda366h.htm), [SciPy Beta CDF, survival and quantile APIs](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.beta.html).
