# Expected value and pot odds / 期望值与底池赔率

EV inputs require finite JSON numbers within the published bounds; booleans and
numeric strings are rejected before calculation. Zero-cost calls and 0%/100%
equity remain valid. See the [decision input contract](../experiment-controls.md#decision-numbers--决策数值).

EV 输入须为公开边界内的有限 JSON 数值；布尔值和数字字符串会在计算前被拒绝。
零成本跟注与 0%/100% 胜率仍合法，详见上述决策输入契约。

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

## Editing and recovery / 编辑与恢复

The first calculation starts immediately. Further slider changes update the controls immediately and request a calculation after a 150 ms editing pause. Superseded browser requests are aborted, and late responses cannot overwrite current results. Cancellation does not guarantee that a request already received by the server stops running; this endpoint is read-only and does not create experiment records.

首次计算立即开始。之后滑块即时显示新输入，连续编辑暂停 150 毫秒后请求计算。过时浏览器请求会被取消，延迟响应不会覆盖当前结果。取消无法保证服务器已经收到的请求停止执行；此接口只读，不创建实验记录。

Metrics, decision and curve are hidden while inputs are unsettled or a calculation is pending. Placeholders reserve the metric grid and chart space. A matching successful result can be reused within the shared 30-second fresh-cache window. Changing the effective stack also changes the cache key, even if the numerical EV happens to be unchanged. Returning focus to the window does not trigger an EV request.

编辑尚未结束或等待计算时，指标、决策与曲线暂时隐藏，占位保留指标网格和图表空间。输入完全一致的成功结果可在共享的 30 秒新鲜缓存期内复用。有效筹码改变也会使用不同缓存键，即使 EV 数值恰好不变。窗口重新获得焦点不会触发 EV 请求。

A failed request shows its error and available request ID with **Retry calculation**. Retry uses the current inputs without resetting the sliders; there is no automatic error retry. Editing is another way to recover. When the browser reports offline, the calculation waits and resumes for the latest inputs after reconnecting. Connection failures that the browser does not identify as offline show the retryable error instead.

请求失败会显示错误及可用的请求 ID，并提供**重试计算**。重试使用当前输入，不重置滑块，也不会自动重试错误；修改输入同样可恢复计算。浏览器报告离线时，计算暂停，重连后只计算最新输入。浏览器未识别为离线的连接故障会显示可重试错误。

To reproduce locally with the real API:

1. Run `./pokerlab` and open `/ev`. The defaults (`P=100`, `B=C=50`, `e=30%`) show `25.00%` required equity and `+$10.00` incremental call EV.
2. Filter browser Network requests to `/ev/calculate`. Drag or repeatedly press an arrow key with gaps below 150 ms: the burst sends one request when editing settles, unless that exact tuple is already fresh in the cache. Longer pauses may send more requests.
3. Set `P=105` and `e=30.5%` for the worked example above. Confirm the input, metric and solid marker agree; the threshold comes from the API.
4. Block `/ev/calculate` in browser developer tools and edit an input. The page must hide the old result and show a recoverable error. Unblock it and choose **Retry calculation**. For offline behavior, switch the browser offline, edit, then reconnect; only the latest tuple should be calculated.

使用真实 API 在本地复现：

1. 运行 `./pokerlab`，打开 `/ev`。默认 `P=100`、`B=C=50`、`e=30%`，应显示盈亏平衡胜率 `25.00%`、增量跟注 EV `+$10.00`。
2. 在浏览器 Network 面板筛选 `/ev/calculate`。拖动或连续按方向键，编辑间隔保持在 150 毫秒内：停止后只发送一次请求；完全相同的输入若仍在新鲜缓存中则无需请求。停顿更久可能产生多次请求。
3. 设置 `P=105`、`e=30.5%` 复现上方算例，确认输入、指标与实线标记一致，盈亏平衡值来自 API。
4. 在开发者工具阻止 `/ev/calculate`，修改输入；旧结果应隐藏并显示可恢复错误。取消阻止后点击**重试计算**。测试离线时，将浏览器设为离线、编辑后重连，只应计算最新输入。

Verified on **2026-11-28** against a freshly built Docker deployment: ten continuous desktop keyboard steps and ten mobile touch-move events each produced one calculation request. The decision/chart card heights stayed at `182/522 px` on a `1440 px` English viewport and `422/546 px` on a `390 px` Chinese viewport while waiting for a delayed real response. Both languages passed failure/retry and offline-edit/reconnect checks with no page JavaScript errors or horizontal overflow. These are measured interaction examples, not a throughput benchmark; normal network errors were deliberately induced for recovery testing. The [desktop](../../output/playwright/ev-lab.png) and [mobile](../../output/playwright/ev-zh-mobile.png) screenshots show the worked example above.

**2026-11-28** 使用新构建的 Docker 部署实测：桌面连续十次键盘调整与手机连续十次触摸移动各产生一次计算请求。延迟真实响应期间，`1440 px` 英文视口的决策/图表卡片高度保持 `182/522 px`，`390 px` 中文视口保持 `422/546 px`。两种语言的失败重试、离线编辑后重连均通过，无页面 JavaScript 异常和横向溢出。这是交互实例测量，不是吞吐量基准；恢复测试中的网络错误为主动触发。[桌面](../../output/playwright/ev-lab.png)与[移动端](../../output/playwright/ev-zh-mobile.png)截图展示上方算例。
