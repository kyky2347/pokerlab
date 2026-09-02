# Contributing / 贡献指南

Thank you for helping improve PokerLab. Mathematical correctness, reproducibility, and honest product communication take priority over feature count.

感谢你改进 PokerLab。数学正确性、可复现性和诚实的产品表达优先于功能数量。

## Development setup / 开发环境

```bash
git clone https://github.com/kyky2347/project-s8qftxtm.git
cd project-s8qftxtm
corepack enable
make setup
make dev
```

Pinned runtime versions are recorded in `.node-version`, `.python-version`, `rust-toolchain.toml`, `pnpm-lock.yaml`, `apps/api/uv.lock`, and `packages/poker-core/Cargo.lock`.

## Change requirements / 变更要求

- Add or update tests for every probability, range, EV, or solver behavior change. / 修改概率、范围、EV 或求解器行为时必须同步测试。
- Reject duplicate cards and impossible state geometry at the domain boundary. / 在领域边界拒绝重复牌和不可能的状态几何。
- Keep stochastic work seed-driven and reproducible. / 所有随机实验必须由种子驱动并可复现。
- Do not add third-party production evaluators or poker solvers. / 不得加入第三方生产牌力评估器或扑克求解器。
- Keep solver limitations visible in both the UI and documentation. / 求解器限制必须同时出现在界面与文档中。
- Preserve English and Chinese user-facing copy. / 保持面向用户的中英文内容。
- Never substitute placeholder or fabricated metrics for a failed calculation. / 计算失败时绝不使用占位或伪造指标。

## Quality gate / 质量门禁

```bash
make check
pnpm --filter web test:e2e
docker compose config --quiet
```

For visual changes, inspect desktop and mobile layouts in a real browser. For core changes, compare the Rust path against the Python reference and include a deterministic regression case.

视觉变更需要在真实浏览器中检查桌面端和移动端；核心算法变更需要与 Python 参考实现交叉验证，并加入确定性的回归样例。

## Pull requests / 拉取请求

Keep pull requests focused. Explain the problem, mathematical or product impact, validation performed, and any remaining limitations. Do not mix unrelated formatting changes with algorithm changes.

请保持 PR 聚焦，并说明问题、数学或产品影响、验证方式以及剩余边界；不要把无关格式化与算法修改混在同一个 PR 中。
