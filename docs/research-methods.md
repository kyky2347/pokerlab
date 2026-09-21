# Research benchmark methods / 研究基准方法

[Desktop English preview / 桌面英文预览](../output/playwright/research-agents.png) · [Mobile Chinese preview / 手机中文预览](../output/playwright/research-agents-zh-mobile.png)

## What is measured / 衡量什么

`POST /research/agents` compares four fixed call/fold policies on the same synthetic river decisions. It does not deal cards, simulate complete matches, learn an opponent model, or train CFR. The separate **CFR Solver Lite** runs the repository's real CFR+ implementation.

`POST /research/agents` 在相同的合成河牌决策上比较四种固定跟注/弃牌策略。它不发牌、不模拟完整对局、不学习对手模型，也不训练 CFR。独立的 **CFR 轻量求解器** 才会运行仓库中的真实 CFR+ 实现。

Each decision samples a pot `P ~ Uniform(40, 200)`, a call `C ~ Uniform(10, P)`, and equity `e ~ Uniform(0, 1)`. `P` is the pot **before** an opponent bet of `C`. All policies have access to the generated true equity. Call EV is `e × (P + 2C) − C`; folding has incremental EV zero. These are abstract chip units, not dollars.

每次决策抽取底池 `P ~ Uniform(40, 200)`、跟注额 `C ~ Uniform(10, P)` 与胜率 `e ~ Uniform(0, 1)`。`P` 是对手下注 `C` **之前**的底池。所有策略都可获得生成的真实胜率。跟注 EV 为 `e × (P + 2C) − C`，弃牌的增量 EV 为零；单位是抽象筹码，而不是美元。

| Policy / 策略 | Rule / 规则 |
| --- | --- |
| `RandomAgent` | Call with probability 50%. / 以 50% 概率跟注。 |
| `TightThresholdAgent` | Call at `e ≥ C/(P+2C) + 0.04`. / 胜率需比底池赔率阈值高 4 个百分点。 |
| `PotOddsAgent` | Call when EV is nonnegative; oracle for this known-equity toy problem. / EV 非负时跟注，是此已知胜率简化问题的最优基准。 |
| `SoftmaxAgent` | Call with probability `sigmoid(EV / max(1, 0.03P))`; fixed, not learned. / 以该逻辑函数概率跟注，策略固定且未经学习。 |

## Metrics and uncertainty / 指标与不确定性

- **Mean EV:** mean conditional EV of the selected actions, not sampled win/loss payouts. / 所选动作的条件期望收益均值，不是抽样产生的实际输赢。
- **Decision regret:** mean `max(0, call_EV) − chosen_action_EV`; the pot-odds oracle has zero regret. / 相对每次最优动作的平均损失；已知胜率的底池赔率策略遗憾为零。
- **Call frequency:** calls divided by decisions. / 跟注次数除以决策次数。
- **Variance:** centered squared deviations divided by `n`, retained for compatibility; units are squared chips. / 为兼容旧结果，方差使用分母 `n`；单位为筹码平方。
- **Standard error:** `sqrt(variance / (n−1))`, equivalent to sample standard deviation divided by `sqrt(n)`. / 标准误等于样本标准差除以 `sqrt(n)`。
- **Approximate 95% interval:** `mean ± t(0.975, n−1) × standard_error`. / 均值的近似 95% 置信区间采用该公式。

The interval follows the [NIST mean-confidence formula](https://www.itl.nist.gov/div898/handbook/eda/section3/eda352.htm), using [SciPy's Student t quantile](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.t.html). The generated EVs are not normally distributed: coverage is approximate, especially for smaller batches. These are marginal intervals, **not** paired policy-difference tests; overlapping or separated intervals alone do not establish a ranking. They do not describe real-world poker strength or uncertainty in an estimated equity input.

区间采用上述 NIST 公式与 SciPy t 分位数。生成的 EV 并非正态分布，因此覆盖率是近似的，小样本尤其需要谨慎。这些是各策略均值的边际区间，**不是**策略差值的配对检验；不能仅根据区间重叠与否认定排名。它们不描述真实扑克实力，也不包含胜率估计本身的误差。

## Reproduction and historical records / 复现与历史记录

The API accepts 100, 1,000, or 10,000 decisions and integer seeds `0..2^63−1`. The browser restricts seeds to `0..2^53−1` to avoid JavaScript integer rounding. Changing parameters clears stale results; run the comparison again before exporting. JSON includes the complete result and methodology. Every CSV row repeats its seed, decision count, experiment ID, policy formula, confidence method, scope limitations, and `benchmark_version`.

API 支持 100、1,000 或 10,000 次决策与 `0..2^63−1` 的整数种子。浏览器限制为 `0..2^53−1`，避免 JavaScript 整数精度损失。修改参数会清空旧结果，重新计算后才能导出。JSON 包含完整结果和方法；CSV 每行重复种子、数量、实验 ID、策略公式、区间方法、限制与 `benchmark_version`。

New results use `river-call-fold-v2`. Random scenario/action draws are unchanged; older mean EV, regret, and population variance are preserved within floating-point rounding after applying this name mapping:

新结果使用 `river-call-fold-v2`。随机情境与动作抽样顺序保持不变；按下表映射后，旧版平均 EV、遗憾和总体方差在浮点舍入误差内一致：

| Legacy label / 旧名称 | Correct label / 新名称 |
| --- | --- |
| `RandomAgent` | `RandomAgent` |
| `PotOddsAgent` | `TightThresholdAgent` |
| `EquityAgent` | `PotOddsAgent` |
| `CFRAgent` | `SoftmaxAgent` |

Old stored records are not rewritten. A record without `benchmark_version` is a legacy result and must be interpreted using this mapping. Reproduction excludes wall-clock runtime and experiment IDs; cross-platform floating-point rounding may differ.

不会改写历史记录。缺少 `benchmark_version` 的记录属于旧版，请按上表理解。复现不包括耗时与实验 ID；跨平台可能存在浮点舍入差异。

```bash
curl -X POST http://localhost:8000/research/agents \
  -H 'content-type: application/json' \
  -d '{"episodes":1000,"seed":20250902}'
```
