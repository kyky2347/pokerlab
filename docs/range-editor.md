# Range editing / 范围编辑

The Range Lab matrix edits starting-hand weights; physical combinations, blockers
and equity are calculated by the poker backend. The active hand's slider supports
1% precision. Hero and villain ranges remain independent.

范围实验室矩阵用于编辑起手牌权重；物理组合、阻断牌和胜率由扑克后端计算。
当前手牌的滑块支持 1% 精度，英雄与对手范围分别保存。

On narrow screens only the card grid scrolls horizontally, keeping the editing
instructions and precision slider in view. / 窄屏仅横向滚动牌格区域，操作提示与精度
滑块保持可见。

| Input / 输入 | Behavior / 行为 |
| --- | --- |
| Click, tap, Enter or Space / 点击、轻触、Enter 或空格 | Advance to the next 25% step, wrapping from 100% to 0%. A custom 37% becomes 50%. / 前进至下一个 25% 档位，100% 后回到 0%；自定义 37% 下一步为 50%。 |
| Mouse drag / 鼠标拖动 | Hold the primary button and paint the first cell's new weight over each entered cell. / 按住主按钮，将起始单元格的新权重涂到经过的单元格。 |
| Touch or pen swipe / 触屏或触控笔滑动 | Scroll normally; only a completed tap edits a cell. Drag painting is mouse-only. / 正常滚动，仅完成轻触才修改单元格；拖动涂选仅限鼠标。 |
| Arrow keys / 方向键 | Move focus without changing weights; stop at matrix edges. / 移动焦点，不修改权重，到达矩阵边界后停止。 |
| Home / End | First / last cell in the current row. / 当前行首 / 行末。 |
| Ctrl + Home / End | First / last cell of the matrix. / 整张矩阵首 / 尾单元格。 |
| Tab / Shift + Tab | Enter or leave the matrix through one tab stop. Shift + Tab from the selected cell reaches its precision slider. / 通过一个 Tab 停靠点进入或离开矩阵；从选中单元格按 Shift + Tab 可到达精度滑块。 |
| Slider arrow keys / 滑块方向键 | Adjust the selected hand by 1%. / 每次调整当前手牌权重 1%。 |

Right-click, middle-click and Ctrl-click do not edit. Painting stops on release,
pointer cancellation, window blur, a hidden tab or a context menu. If release
occurs outside the window, re-entering without the primary button held also stops
the stroke. Existing edits remain; stopping a stroke is not undo.

右键、中键及 Ctrl + 点击不会修改权重。松开按钮、指针取消、窗口失焦、标签页隐藏
或打开上下文菜单时停止涂选；若在窗口外松开，未按住主按钮重新进入也会停止。
此前已完成的修改保留，停止涂选不等于撤销。

The grid has 13 rows and 169 cells, with a single focusable button in the page's
tab order. Cell names expose the current weight; instructions and accessible
labels follow the English/Chinese language setting. This follows the
[WAI-ARIA grid keyboard pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/).

网格含 13 行、169 个单元格，页面 Tab 顺序中只包含其中一个按钮。单元格名称包含
当前权重，提示与无障碍名称跟随中英文语言设置；键盘操作遵循上述 WAI-ARIA 网格模式。

## Verification / 验证

```bash
pnpm --filter web test src/components/range-matrix.test.tsx
pnpm --filter web test:e2e
```

Component regressions cover quarter steps, native keyboard activation, focus
boundaries, slider precision, rapid strokes, pointer identity, interruption,
disabled state, controlled range replacement and Chinese labels. The existing
browser suite exercises Range Lab with the real API. For manual touch acceptance,
swipe across the matrix on a narrow touch viewport: horizontal scroll must move
while every weight stays unchanged; a subsequent tap must advance just one cell.
See [browser verification](browser-testing.md) for isolated services and reports.

组件回归覆盖档位、原生键盘激活、焦点边界、滑块精度、快速涂选、指针身份、中断、
禁用状态、受控范围替换和中文名称；现有浏览器套件使用真实 API 验证范围实验室。
手动触屏验收时，在窄触屏视口横向滑动矩阵：滚动位置应改变，全部权重应保持不变；
随后轻触应只推进一个单元格。隔离服务和报告说明见[浏览器验收](browser-testing.md)。

On November 6, 2026, desktop Chrome and Chrome with an iPhone 15 touch viewport
passed the manual flow against the Docker stack and real API. A native touch
swipe scrolled 291 CSS pixels without changing any weight; the slider stayed in
place and the next tap changed only one hand. This is browser touch emulation,
not physical-device or screen-reader certification.

2026 年 11 月 6 日，桌面 Chrome 与模拟 iPhone 15 触屏视口的 Chrome 使用 Docker
部署和真实 API 通过上述验收：原生触控事件横向滚动 291 CSS 像素，全部权重保持
不变，滑块位置不变，随后轻触仅修改一个手牌。这是浏览器触屏模拟，不代表实体设备
或屏幕阅读器认证。[中文移动端截图](../output/playwright/range-input-mobile-zh.png)。
