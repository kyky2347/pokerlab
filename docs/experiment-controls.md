# Reproducible experiment controls / 可复现实验参数

Seeds and run counts are deliberately strict. A request must not silently change
`true` into seed `1`, turn `"100"` into a sample count, or accept a floating-point
seed that a client may already have rounded.

种子和运行次数采用严格校验：请求不能静默将 `true` 转为种子 `1`、将 `"100"`
转为样本数，也不能接受可能已被客户端舍入的浮点种子。

## HTTP contract / HTTP 契约

| Control / 参数 | Accepted values / 接受值 |
| --- | --- |
| `seed` | JSON integer, 0 through 9,223,372,036,854,775,807; default 20250902. / JSON 整数，范围如左，默认 20250902。 |
| Fixed-hand / 固定手牌 `samples` | Integer 1–500,000; default 50,000. / 整数，默认 50,000。 |
| Range / 范围 `samples` | Integer 100–100,000; default 20,000. / 整数，默认 20,000。 |
| River solver / 河牌求解 `iterations` | Integer 100–100,000 in the schema; default 2,000. / 模型要求整数，默认 2,000。 |
| Agent comparison / 策略对比 `episodes` | Exactly 100, 1,000 or 10,000; default 1,000. / 仅接受左列三个整数，默认 1,000。 |

Deployment limits still apply after these schema bounds: the standard API permits
at most 500,000 Monte Carlo samples and 5,000 solver iterations. Check
`GET /diagnostics` for the actual configured limits. This change does not raise
limits, create background jobs, or add authentication.

模型上限之外仍须遵守部署限制：API 默认最多 500,000 次蒙特卡洛采样、5,000 轮
求解。实际配置以 `GET /diagnostics` 为准。本改动不提高限制、不增加后台任务，
也不提供身份认证。

All five stochastic routes use this seed contract: `/equity/monte-carlo`,
`/research/monte-carlo`, `/range/equity`, `/research/agents`, and `/trainer/question`.
Range requests validate their controls even when the chosen workload can be
enumerated exactly and does not consume random draws.

上述五个随机实验接口统一遵守种子契约。即使范围请求最终采用精确枚举、没有消耗
随机抽样，也仍校验其种子和次数，避免保存含糊的实验参数。

Booleans, numeric strings, null, arrays, objects and fractional numbers are not
accepted. Floating-point JSON representations such as `100.0` or `1e2` are also
rejected even if mathematically integral. Invalid controls return HTTP 422 with
`error.code = request_validation_error`, field-level `details`, and a request ID.
They do not start the requested calculation, acquire a solver slot, or insert an
experiment, training question, answer or solver job.

不接受布尔值、数字字符串、null、数组、对象和小数。`100.0` 或 `1e2` 等浮点
JSON 表示即使数学上为整数也会被拒绝。非法参数返回 HTTP 422，包含上述错误码、
字段级详情及请求 ID；不会启动所请求的计算、占用求解名额或新增任何实验、训练题、
答案及求解记录。

```json
{
  "hero": ["As", "Ks"],
  "villain": ["Qh", "Qd"],
  "board": ["Js", "8s", "2c"],
  "samples": 1000,
  "seed": 20250902
}
```

This is a valid `/equity/monte-carlo` body. Omit optional controls to use the same
defaults as before; explicit null is not an instruction to use a default.

这是有效的 `/equity/monte-carlo` 请求体。省略可选参数时沿用原默认值；显式传
null 不等于省略。

## Precision and direct Python use / 精度与直接 Python 调用

Python callers must supply built-in `int` seeds in the same nonnegative signed
64-bit range and positive built-in `int` sample/iteration counts. `bool` is not
accepted despite being an `int` subclass. Validation happens before random draws,
range-pair construction, trainer history queries, or solver-state updates.
Direct methods do not inherit HTTP workload ceilings; callers must bound their
own workloads. Direct agent comparisons retain their existing 2–10,000 episode
range; the HTTP endpoint intentionally offers only the three presets above.

直接 Python 调用必须使用内置 `int`：种子遵守相同的非负有符号 64 位范围，采样
和迭代次数必须为正整数。尽管 `bool` 是 `int` 的子类，仍会被拒绝。校验先于随机
抽样、范围组合对构建、训练历史查询和求解状态更新。直接调用不继承 HTTP 的工作量
上限，调用方须自行限制规模；直接策略对比保留 2–10,000 局范围，HTTP 则仅提供
上述三个预设。

JavaScript `Number` cannot represent every 64-bit integer. Both editable browser
seed controls (Equity Lab and Research's agent comparison) therefore accept only
safe integers (0 through 2^53 − 1, or 9,007,199,254,740,991). Python
clients can send the full supported range as exact JSON integer tokens. Do not
convert large seeds through a JavaScript `Number` or quote them as request
strings. The history summary's string seed is a display/export representation,
not the request schema; the original JSON export preserves integer bytes.

The published `/openapi.json` also retains the exact integer limit. FastAPI's
intermediate schema model represents numeric bounds as floats, so the app uses
its [documented OpenAPI customization mechanism](https://fastapi.tiangolo.com/how-to/extending-openapi/)
to restore the shared seed bounds after generation, retaining normal routes,
metadata and schema caching. Runtime validation remains in the request models.

JavaScript `Number` 无法精确表示全部 64 位整数，因此胜率实验室和研究页策略对比
的两个可编辑种子控件只接受安全整数（0 至 2^53 − 1，即 9,007,199,254,740,991）。
Python 客户端可按精确 JSON 整数提交完整支持范围。
不要将大种子转成 JavaScript `Number`，也不要给请求种子加引号。历史摘要中的
字符串种子用于展示/导出，不是提交请求的格式；原始 JSON 导出保留整数文本。

公开的 `/openapi.json` 同样保留精确整数上限。FastAPI 中间模型以浮点数表示
数值边界，因此应用通过上述官方 OpenAPI 自定义机制在生成后恢复共用的种子边界，
保留原有路由、元数据和缓存；运行时校验仍由请求模型负责。

The browser keeps the original editable text, using a shared digits-only parser
before submission. Empty values, whitespace, signs, decimals, exponent notation
and out-of-range values are invalid. Leading zeroes are allowed: `007` stays in
the field and is submitted as JSON integer `7`. Equity Lab shows a localized,
screen-reader-linked error and disables all three calculations until corrected;
it does not silently replace an empty seed with zero or round a large input.
For example, `9007199254740993` previously reached the API as `9007199254740992`.
It is now retained verbatim and rejected before sending a request.

浏览器保留编辑原文，提交前共享仅允许数字的解析器。空值、空白、正负号、小数、
指数和超范围值均无效。允许前导零：`007` 在输入框中保持原样，提交为 JSON 整数
`7`。胜率实验室显示与输入框关联的本地化读屏提示，修正前禁用全部三项计算，
不再把空值静默变为零或舍入大整数。例如 `9007199254740993` 此前会以
`9007199254740992` 到达 API，现在保留原文并在发请求前拒绝。

Each valid Equity Lab run captures its cards, sample count and numeric seed.
Editing the seed clears visible results; delayed responses from an earlier run
cannot reappear as the edited run's result. Editing does not cancel server work
already requested or undo saved experiments. A corrected seed requires an
explicit new calculation. Existing records keep the seed actually stored; the
original typed digits from an older rounded submission cannot be reconstructed.

每次合法胜率计算固定本次牌面、样本数和数字种子。编辑种子会清除可见结果，
旧请求的延迟响应不会冒充新参数的结果。编辑不会取消已发出的服务端计算或撤销
已存实验，修正后需明确再次点击计算。历史记录保留实际存储种子，无法从旧版已
舍入的请求恢复当时输入的原始数字。

This is an intentional tightening for clients that relied on coercion. Valid
integer inputs retain their RNG stream, accumulation order, results, uncertainty,
default values and Rust/Python engine selection. Existing records are neither
revalidated nor rewritten; no database migration is required. Trainer selection
also depends on the current weakness history, so a seed alone does not freeze
future adaptive questions after that history changes.

这是对依赖隐式转换的客户端的明确兼容性收紧。合法整数输入的随机序列、累加顺序、
结果、不确定性、默认值及 Rust/Python 引擎选择均保持不变。已有记录不重校验或
改写，无需数据库迁移。训练选题还依赖当前弱项历史，历史改变后，仅凭种子不能
固定后续自适应题目。

## Verification / 验证

```bash
pnpm --filter web exec vitest run src/app/equity/page.test.tsx src/lib/research.test.ts
```

The bilingual browser-control regressions cover unsafe values, the maximum safe
seed, zero, leading zeroes, correction, complete request payloads and late/out-of-order
responses. They use transport fixtures, not substitute poker results.

双语浏览器控件回归覆盖非法值、最大安全种子、零、前导零、修正、完整请求参数及
延迟/乱序响应；其中模拟数据仅用于传输测试，不作为产品扑克结果。

```bash
cd apps/api
uv run pytest tests/test_controls.py tests/test_monte_carlo_cache.py tests/test_cfr_allocations.py
```

The controls suite exercises SQLite and, when `POKERLAB_TEST_POSTGRES_URL` is set,
isolated PostgreSQL schemas. It checks rejection before side effects, solver-state
preservation, raw JSON number forms, OpenAPI compatibility and exact 64-bit
round-trips across every stochastic route. Existing frozen-reference tests verify
full seeded results and CFR states; the desktop/mobile journeys verify normal UI
requests against the real API. See [isolated browser verification](browser-testing.md).

参数测试在 SQLite 及配置 `POKERLAB_TEST_POSTGRES_URL` 时的隔离 PostgreSQL
模式中验证：副作用前拒绝、求解状态保留、原始 JSON 数值形式、OpenAPI 兼容性及
全部随机接口的精确 64 位种子往返。已有冻结参考测试核对完整种子结果及 CFR 状态；
桌面/移动端流程使用真实 API 验证正常界面请求，详见上述浏览器验收指南。
