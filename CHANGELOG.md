# Changelog / 更新记录

All notable changes are documented here. / 所有重要变更记录于此。

## Unreleased / 尚未发布

- Reuse actual river showdown outcomes within each solver job while preserving complete strategies and convergence traces; add a reproducible cached/uncached benchmark for both engines.
- Reject underflowed solver chance mass, invalid evaluator outputs, and invalid direct iteration counts. Validate games before creating jobs; roll back failed writes, preserve original errors when failure reporting also fails, and always release solver capacity.
- Add SQLite/PostgreSQL fault-injection and concurrency regression tests; document synchronous, per-process limits and interrupted-job recovery limitations.
- 在每个河牌求解任务内复用真实摊牌结果，完整策略和收敛轨迹保持不变；新增双引擎缓存/未缓存对照基准。
- 拒绝求解权重总质量下溢、非法评估输出和非法直接迭代次数；创建任务前验证牌局，写入失败时回滚，失败状态也无法写入时保留原始异常，并始终释放并发名额。
- 新增 SQLite/PostgreSQL 真实故障注入与并发回归测试，明确同步接口、进程级并发及中断任务恢复的限制。

- Halve exact turn-map showdown evaluations from 1,980 to 990 by sharing unordered runouts; preserve all 45 conditional equities, canonical ordering, and Rust/Python fallback. Add an alternating-order, output-checked benchmark and mathematical derivation.
- Reject cross-player duplicate cards at both showdown boundaries and malformed direct card construction. Expand exact-enumeration, split-pot, symmetry, API, fallback, and cross-engine regression coverage.
- 通过复用无序补牌组合，将精确转牌地图的摊牌评估由 1,980 次减至 990 次；保持全部 45 张转牌的条件胜率、标准顺序及 Rust/Python 回退不变，新增交替执行顺序且核对完整结果的性能基准与数学推导。
- 两个摊牌引擎均拒绝双方共享同一张牌的非法状态，并修复直接创建非法牌对象的漏洞；补充精确枚举、平局、对称性、API、回退和跨引擎回归测试。

- Correct research policy names: the former `CFRAgent` is a fixed `SoftmaxAgent`, not a trained CFR solver. Distinguish the conservative threshold baseline from the true pot-odds oracle without changing seeded scenario/action sequences.
- Add call frequency, standard error, approximate 95% mean-EV intervals, and versioned methodology to saved research results. Expose editable, precision-checked seeds and self-contained JSON/CSV exports; fix CSV quote escaping and bilingual result labels.
- 修正研究策略命名：原 `CFRAgent` 实为固定 `SoftmaxAgent`，不冒充经过 CFR 训练的求解器；区分保守阈值与已知胜率的底池赔率策略，并保持种子抽样序列不变。
- 研究记录新增跟注频率、标准误、平均 EV 的近似 95% 区间与方法版本；界面支持精度校验后的自定义种子、完整 JSON/CSV 导出，并修复 CSV 引号转义与双语结果标签。

- Persist trainer questions with a 24-hour lifetime and atomic one-time scoring across API workers/restarts; failed writes roll back without consuming the question.
- Add packaged, transactional Alembic upgrades for fresh and legacy databases, signed 64-bit PostgreSQL seeds, explicit UTC history timestamps, and an indexed stable experiment timeline.
- Stop on configured-database initialization failures instead of silently diverting experiments into SQLite; preserve the independent Rust/Python fallback.
- Add real PostgreSQL migration, concurrency, restart, and rollback tests to CI, with bilingual upgrade/recovery documentation.

- 训练题持久化并保留 24 小时有效期，支持跨 API 进程/重启的一次性原子评分；写入失败会回滚，不消耗题目。
- 新增随包分发的事务型 Alembic 新库/旧库升级，支持 PostgreSQL 有符号 64 位种子、明确的 UTC 时间戳和带索引的稳定台账排序。
- 指定数据库初始化失败时明确停止，不再悄悄把实验写入 SQLite；独立的 Rust/Python 回退保持不变。
- CI 新增真实 PostgreSQL 迁移、并发、重启与回滚测试，并同步中英文升级恢复文档。

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
