# Changelog / 更新记录

All notable changes are documented here. / 所有重要变更记录于此。

## Unreleased / 尚未发布

- Precompute weighted sampling distributions and reuse the deck without changing seeded pair/runout sequences; add a reproducible range benchmark and exact/Monte Carlo regression coverage.
- Run diagnostic Kuhn verification once per service startup, enforce configured range-sampling limits, and reject underflowed zero-mass ranges with a structured error.
- Harden launcher credential creation against concurrent starts and missing database credentials; validate restart arguments before stopping, report browser-opening failures honestly, and add `--no-build` for existing images.
- Isolate API test databases from local experiment data and add launcher regression coverage to the existing quality gate.

- 预计算加权采样分布并复用牌堆，保持固定种子的手牌对与补牌序列不变；新增可复现范围基准与精确/蒙特卡洛回归测试。
- 诊断 Kuhn 自检改为每次服务启动时执行一次；范围采样遵守配置上限，权重下溢导致总质量为零时返回结构化错误。
- 加固启动器的并发凭据创建和数据库凭据丢失保护；停止服务前校验重启参数，如实报告浏览器打开失败，并新增 `--no-build` 复用镜像选项。
- API 测试数据库与本地实验数据隔离；启动器回归测试纳入已有质量门禁。

- Added CODEOWNERS and immutable SHA pinning for every GitHub Actions dependency.
- Updated PyO3 to 0.29 to resolve GHSA-36hh-v3qg-5jq4 and GHSA-chgr-c6px-7xpp.
- 新增 CODEOWNERS，并将所有 GitHub Actions 依赖锁定到不可变提交 SHA。
- 将 PyO3 升级至 0.29，修复 GHSA-36hh-v3qg-5jq4 与 GHSA-chgr-c6px-7xpp。
- Added the bilingual `./pokerlab` launcher for one-command build, startup, health verification, browser opening, status, logs, and safe shutdown.
- Replaced the checked-in Compose password with a locally generated random credential and removed the unnecessary host PostgreSQL port.

- 新增双语 `./pokerlab` 启动器，以一条命令完成构建、启动、健康检查、浏览器打开、状态查询、日志与安全停止。
- 移除 Compose 中写死的数据库口令，改为本地随机生成，并取消不必要的 PostgreSQL 宿主机端口暴露。

## 1.0.0 — 2026-09-02

- Released the bilingual Next.js research interface and typed FastAPI service.
- Added exact and Monte Carlo equity, weighted ranges, adaptive training, EV analysis, CFR+ river solving, Bayesian research, agent comparisons, and experiment persistence.
- Added the Rust/PyO3 evaluator with Python reference fallback and cross-check tests.
- Added desktop/mobile browser validation, CI, reproducible containers, mathematical documentation, and measured benchmark records.
- Hardened state validation, engine attribution, request tracing, solver concurrency, stale-result handling, and deployment workflows.

- 发布双语 Next.js 研究界面与类型化 FastAPI 服务。
- 加入精确/蒙特卡洛胜率、加权范围、自适应训练、EV、CFR+ 河牌求解、贝叶斯研究、代理对比和实验持久化。
- 加入 Rust/PyO3 评估器、Python 参考回退与交叉验证测试。
- 加入桌面/移动端浏览器验收、CI、可复现容器、数学文档和实测基准。
- 强化状态校验、引擎归因、请求追踪、求解器并发、陈旧结果处理与部署流程。
