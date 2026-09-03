# Changelog / 更新记录

All notable changes are documented here. / 所有重要变更记录于此。

## Unreleased / 尚未发布

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
