# Solver limitations / 求解器限制

PokerLab labels the module **Educational Approximate Solver** because its tree is intentionally finite.

- Heads-up and river only.
- Five fixed board cards and fixed weighted ranges.
- OOP may check, bet a small size, or bet a large size.
- After a check, IP may check, bet small, or bet large.
- Facing a bet, the other player may fold or call.
- No raises, no earlier streets, no dynamic stack geometry, no rake.
- Private information sets use exact physical combos and public action history; the UI aggregates results into 169 hand classes.
- Terminal showdowns use the real seven-card evaluator and blocker-compatible combo pairs.
- The displayed "average regret" is a normalized positive-regret diagnostic, not rigorous exploitability.

本模块适合学习信息集、到达概率、遗憾匹配和混合策略，不应被描述为职业级 GTO 求解器，也不应被用于实时牌局决策。

## Runtime and failure limits / 运行与故障限制

Showdown caching is scoped to one solver instance with a fixed board and a
deterministic evaluator. It reduces repeated hand evaluation, not the number of
game-tree traversals. Large ranges and iteration counts remain CPU intensive.
The automatic Rust-to-Python fallback and engine attribution are unchanged.

摊牌缓存仅用于公共牌固定、评估器确定性的单个求解实例。它减少重复牌力评估，不减少博弈树遍历次数；大范围和高迭代数仍会消耗较多 CPU。Rust → Python 自动回退及实际引擎标识保持不变。

The job endpoint remains synchronous, with a concurrency limit **per API process**;
it is not a distributed job queue. Invalid game inputs do not create job records.
Recoverable write failures are rolled back and an already-persisted job is marked
failed when storage is available. If the process is killed or failure reporting
also loses database access, a record can remain `running`; this is not proof of
an active computation. There is no automatic restart, retry, or stale-job reaper.
Inspect the API logs and database connectivity before submitting a new job.

任务接口仍为同步执行，并发限制作用于**每个 API 进程**，不是分布式任务队列。非法牌局不会创建任务记录。可恢复的写入错误会回滚，并在存储可用时将已持久化任务标记为失败。进程被终止或失败状态写入也无法连接数据库时，记录可能停留在 `running`，这不代表计算仍在执行。本系统不自动重启、重试或清理过期任务；请先检查 API 日志和数据库连接，再提交新任务。
